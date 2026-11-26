import { createFrameLocale } from '../../src/game-locale.js';
import {SEGMENTS,TOTAL_LENGTH,HAZARDS,VALVES,routeAt,clamp,jumpHeight,hazardAt,movementForKey,keyDirection,clampAtLockedValve,steamState,safeFromSteam,crawlRate,reachedPipeExit} from './route.js';
import {ValveGestureSequence} from './gesture-valve.js';
const $=id=>document.getElementById(id);
const {t, setText} = createFrameLocale();
const canvas=$('game'),ctx=canvas.getContext('2d',{alpha:false});
const WIDTH=1671,HEIGHT=941,PLAYER_SPEED=218,JUMP_DURATION=1.16,RAT_SPEED=248,MAX_ALERT=3;
const RAT_START_DELAY=8, RAT_SPAWN_INTERVAL=9, RAT_SPAWN_VARIATION=4;
const keys=new Set();const images=new Map();let manifest=null;
const state={
 s:0,jump:null,opened:{left:false,right:false},passed:new Set(),retries:0,running:true,started:false,startTime:0,elapsed:0,lastTime:0,
 modalValve:null,toast:'',toastUntil:0,playerStatus:'idle',lastInput:'right',cameraAttempt:0,stream:null,handModel:null,
 handSeq:new ValveGestureSequence(),lastVideoTime:-1,lastHandAt:0,handCameraActive:false,keydownSimAt:null,simHeld:false,
 valveModes:{},muted:false,crawlClock:0,hurtTimer:0,biteCooldown:0,biteFlash:0,guardAlert:0,biteTotal:0,
 rats:[],ratId:0,nextRatSpawn:RAT_START_DELAY,ratTotal:0
};
let audio;const worldLayer=document.createElement('canvas');worldLayer.width=WIDTH;worldLayer.height=HEIGHT;const worldCtx=worldLayer.getContext('2d');
const MP_VERSION='0.10.14';
const MP_ROOT=`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}`;
const HAND_MODEL='https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const CONNS=[[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];
const RAT_SPAWNS=[
 SEGMENTS[0].start+210, SEGMENTS[0].end-130,
 SEGMENTS[1].start+120,
 SEGMENTS[2].start+190, SEGMENTS[2].end+150,
 SEGMENTS[3].start+110,
 SEGMENTS[4].start+310, SEGMENTS[4].end-280,
 SEGMENTS[5].start+210
];
function sound(freq=570,duration=.12,type='sine'){try{audio??=new (window.AudioContext||window.webkitAudioContext)();const a=audio;if(a.state==='suspended')a.resume().catch(()=>{});const o=a.createOscillator(),g=a.createGain();o.type=type;o.frequency.value=freq;g.gain.setValueAtTime(.0001,a.currentTime);g.gain.exponentialRampToValueAtTime(.075,a.currentTime+.015);g.gain.exponentialRampToValueAtTime(.0001,a.currentTime+duration);o.connect(g);g.connect(a.destination);o.start();o.stop(a.currentTime+duration+.01);}catch{}}
function toast(zh,en){state.toast=[zh,en];state.toastUntil=performance.now()+2600;}
function playerSegment(){return routeAt(state.s);}
function scheduleRatSpawn(delay=RAT_SPAWN_INTERVAL+Math.random()*RAT_SPAWN_VARIATION){state.nextRatSpawn=delay;}
function checkpointFor(s){
 const seg=routeAt(s);
 const priorHaz=[...HAZARDS].filter(h=>h.center<s-85).at(-1);
 const base=priorHaz?priorHaz.center-priorHaz.halfWidth-128:seg.start+8;
 return clamp(base,0,TOTAL_LENGTH);
}
async function preload(){
 try{
  const res=await fetch('assets/manifest.json');if(!res.ok)throw new Error('Could not read manifest.json');manifest=await res.json();
  const names=['background/room_01_background_no_gameplay_components.png',...manifest.sprites.map(s=>s.file),
   ...['right','left','up','up_a','up_b','jump','jump_left','jump_right'].map(n=>'thief/'+n+'.png'),
   ...['down','left','right','up'].map(n=>'rats/'+n+'.png'),
   'overlays/pipe_repairs_ladders.png','overlays/pipe_foreground_braces.png'];
  await Promise.all([...new Set(names)].map(name=>new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>{images.set(name,img);resolve();};img.onerror=()=>reject(Error('Could not load '+name));img.src='assets/'+name;})));
  const background=images.get('background/room_01_background_no_gameplay_components.png');
  worldCtx.drawImage(background,0,0,WIDTH,HEIGHT);
  for(const sprite of manifest.sprites){const img=images.get(sprite.file);if(img)worldCtx.drawImage(img,sprite.original_x,sprite.original_y,sprite.width,sprite.height);}
  worldCtx.drawImage(images.get('overlays/pipe_repairs_ladders.png'),0,0,WIDTH,HEIGHT);
 }catch(err){
  setText('load-error-detail','请重新加载页面并检查游戏资源。','Reload the page and check that the game assets are available.');
  $('load-error').hidden=false;
  console.error(err);
 }
}
function pointerInput(k,on){if(on){keys.add(k);if(k==='KeyE')openNearbyValve();if(k==='Space')startJump();}else keys.delete(k);}
window.addEventListener('keydown',e=>{
 const k=e.code;
 if(['ArrowRight','ArrowLeft','ArrowUp','ArrowDown','Space','Enter','KeyW','KeyA','KeyS','KeyD','KeyE','Escape'].includes(k))e.preventDefault();
 if(state.modalValve){if(k==='Escape')closeValve();if(k==='Enter'&&!state.simHeld){state.simHeld=true;state.keydownSimAt=performance.now();}return;}
 if(k==='KeyR'&&!e.repeat){restart();return;}
 keys.add(k);if(k==='Space'&&!e.repeat)startJump();if(k==='KeyE'&&!e.repeat)openNearbyValve();
});
window.addEventListener('keyup',e=>{keys.delete(e.code);if(e.code==='Enter')state.simHeld=false;});
window.addEventListener('blur',()=>{keys.clear();state.simHeld=false;});
document.querySelectorAll('[data-key]').forEach(el=>{const k=el.dataset.key;el.addEventListener('pointerdown',e=>{e.preventDefault();el.setPointerCapture(e.pointerId);pointerInput(k,true);});for(const type of ['pointerup','pointercancel','lostpointercapture'])el.addEventListener(type,()=>pointerInput(k,false));});
function restart(){
 state.s=0;state.jump=null;state.opened={left:false,right:false};state.passed=new Set();state.retries=0;state.running=true;state.started=false;
 state.elapsed=0;state.playerStatus='idle';state.crawlClock=0;state.hurtTimer=0;state.biteCooldown=0;state.biteFlash=0;state.guardAlert=0;state.biteTotal=0;
 state.rats=[];state.ratId=0;state.ratTotal=0;state.valveModes={};scheduleRatSpawn(RAT_START_DELAY);toast('重新开始：沿下水管道潜入！', 'Restarted. Follow the pipes into the museum!');updateHUD();
}
function startJump(){if(!state.running||state.modalValve||state.jump!==null)return;const seg=playerSegment();if(!['left','right'].includes(seg.forward))return;state.jump=0;state.playerStatus='jump';sound(560,.10,'triangle');}
function failSteam(h){
 state.retries++;sound(125,.35,'sawtooth');
 const seg=SEGMENTS.find(s=>s.id===h.segment);
 state.s=Math.max(seg.start+8,h.center-h.halfWidth-105);
 state.jump=null;state.hurtTimer=.85;state.playerStatus='hurt';state.rats=[];state.guardAlert=0;state.biteCooldown=.7;scheduleRatSpawn(RAT_START_DELAY);
 toast('断口危险！等到停喷再起跳。', 'Wait for the steam to stop, then jump across.');
}
function failGuard(){
 state.retries++;state.rats=[];state.guardAlert=0;state.jump=null;state.hurtTimer=.95;state.biteCooldown=1.1;state.playerStatus='hurt';
 state.s=checkpointFor(state.s);scheduleRatSpawn(RAT_START_DELAY);sound(120,.26,'sawtooth');setTimeout(()=>sound(220,.12,'square'),90);
 toast('🚨 惊叫声惊动了保安！本段重试，警觉值已清零。', '🚨 The guard heard you. Section restarted and alert reset.');
}
function openNearbyValve(){
 if(state.modalValve||!state.running)return;
 const valve=VALVES.find(v=>!state.opened[v.id]&&Math.abs(state.s-v.at)<139);
 if(!valve){toast('附近没有需要开启的阀门。', 'There is no locked valve nearby.');return;}
 state.modalValve=valve;state.simHeld=false;state.keydownSimAt=null;state.handSeq.reset();
 setText('modal-heading', `${valve.name} · 手势开闸`, `${valve.nameEn} · Gesture unlock`);$('gesture-meter').style.width='0%';$('demo-meter-fill').style.width='0%';
 setText('gesture-step', '01 · 握住手柄', '01 · GRIP THE HANDLE');$('gesture-picture').textContent='✊';setText('gesture-name', '第一步：握拳', 'Step 1: Make a fist');setText('gesture-instruction', '对着摄像头握拳约半秒，模拟抓住阀门手柄。', 'Hold a fist for about half a second to grip the handle.');
 setText('gesture-status', '等待真实摄像头，或按住 Enter 测试开闸逻辑。', 'Use the camera or hold Enter to simulate opening the valve.');
 $('valve-modal').hidden=false;keys.clear();sound(390,.13);
}
async function stopHandCamera(){
 ++state.cameraAttempt;state.handCameraActive=false;
 if(state.stream){state.stream.getTracks().forEach(t=>t.stop());state.stream=null;}
 const v=$('valve-video');v.pause();v.srcObject=null;
 $('hand-overlay').getContext('2d').clearRect(0,0,640,480);
 $('camera-empty').hidden=false;$('camera-start').disabled=false;$('camera-stop').disabled=true;setText('gesture-tag', '等待手势', 'NO HAND INPUT');
}
async function closeValve(){const had=state.modalValve;state.modalValve=null;state.simHeld=false;state.keydownSimAt=null;$('valve-modal').hidden=true;await stopHandCamera();if(had&&!state.opened[had.id])toast('阀门尚未开启，可以随时再试。', 'The valve is still locked. You can try again.');}
function finishValve(mode){
 const valve=state.modalValve;if(!valve||state.opened[valve.id])return;
 state.opened[valve.id]=true;state.valveModes[valve.id]=mode;
 sound(760,.16);setTimeout(()=>sound(1070,.18),150);
 toast(`${valve.name}已开启 · 继续前进`, `${valve.nameEn} opened · Keep moving`);
 closeValve();updateHUD();
 window.dispatchEvent(new CustomEvent('lfg:pipe-valve-opened',{detail:{valveId:valve.id,source:mode}}));
}
function updateHUD(){
 const segment=playerSegment(), stage=String(SEGMENTS.findIndex(x=>x.id===segment.id)+1).padStart(2,'0');
 setText('stage-badge', `${stage} / ${segment.label}`, `${stage} / ${segment.labelEn}`);
 const steamLeft=3-state.passed.size;
 setText('hazard-badge', `♨ ${steamLeft} 处喷气未过 · 🐀 警觉 ${state.guardAlert}/${MAX_ALERT}`,
  `♨ ${steamLeft} steam gaps left · 🐀 Alert ${state.guardAlert}/${MAX_ALERT}`);
}
function finishLevel(){
 if(!state.running)return;state.running=false;state.s=TOTAL_LENGTH;keys.clear();state.rats=[];
 const detail={timeSeconds:+state.elapsed.toFixed(1),retries:state.retries,valves:state.valveModes,steamCleared:state.passed.size,ratBites:state.biteTotal};
 window.dispatchEvent(new CustomEvent('lfg:pipe-room-complete',{detail}));
 if(window.parent!==window)window.parent.postMessage({type:'lfg:pipe-room-complete',detail},window.location.origin);
 else window.location.assign(new URL('../?stage=museum',window.location.href));
}
function spawnRat(){
 const playerS=state.s;
 let options=RAT_SPAWNS.filter(v=>Math.abs(v-playerS)>180&&Math.abs(v-playerS)<1050);
 if(!options.length)options=RAT_SPAWNS.slice();
 options.sort((a,b)=>Math.abs(a-playerS)-Math.abs(b-playerS));
 options=options.slice(0,Math.min(4,options.length));
 const s=options[Math.floor(Math.random()*options.length)]+(Math.random()*20-10);
 state.rats.push({id:++state.ratId,s,life:0});state.ratTotal++;
 if(state.ratTotal<=2||Math.random()<.25)toast('🐀 老鼠从管道缝隙里窜出来了！别让它咬到。', '🐀 A rat is loose in the pipes. Stay out of its way!');
}
function ratSpriteFor(rat){
 const curr=routeAt(rat.s);const target=routeAt(clamp(rat.s+Math.sign(state.s-rat.s||1)*6,0,TOTAL_LENGTH));
 const dx=target.x-curr.x,dy=target.y-curr.y;
 if(Math.abs(dx)>=Math.abs(dy))return dx>=0?'right':'left';
 return dy>=0?'down':'up';
}
function handleRatBite(){
 state.guardAlert++;state.biteTotal++;state.biteFlash=.52;state.biteCooldown=1.0;state.hurtTimer=.36;state.playerStatus='hurt';
 const knock=(state.lastInput==='right'?36:-36);
 const target=clamp(state.s-knock,0,TOTAL_LENGTH);
 state.s=clampAtLockedValve(state.s,target,state.opened).s;
 sound(165,.22,'square');setTimeout(()=>sound(690,.06,'triangle'),40);
 if(state.guardAlert>=MAX_ALERT){failGuard();return true;}
 toast(`🐀 被咬了！保安警觉值 ${state.guardAlert}/${MAX_ALERT}`, `🐀 Rat bite! Guard alert ${state.guardAlert}/${MAX_ALERT}`);
 return false;
}
function updateRats(dt){
 if(!state.started||!state.running||state.modalValve)return;
 state.nextRatSpawn-=dt;state.biteCooldown=Math.max(0,state.biteCooldown-dt);state.biteFlash=Math.max(0,state.biteFlash-dt);
 if(state.nextRatSpawn<=0&&state.rats.length<2){spawnRat();scheduleRatSpawn();}
 const kept=[];
 for(const rat of state.rats){
  rat.life+=dt;
  const diff=state.s-rat.s;const dir=Math.abs(diff)<1?0:Math.sign(diff);
  rat.s=clamp(rat.s+dir*RAT_SPEED*dt,0,TOTAL_LENGTH);
  const airborne=jumpHeight(state.jump??-1,JUMP_DURATION)>24;
  if(Math.abs(state.s-rat.s)<34&&!airborne&&state.biteCooldown<=0&&state.hurtTimer<=0){
   if(handleRatBite())return;
   continue;
  }
  if(rat.life<18||Math.abs(state.s-rat.s)<720)kept.push(rat);
 }
 state.rats=kept;
}
function updateGame(dt,now){
 if(!state.running||state.modalValve)return;
 if(state.started)state.elapsed+=dt;
 if(state.hurtTimer>0){
  state.hurtTimer=Math.max(0,state.hurtTimer-dt);state.playerStatus='hurt';updateRats(dt);updateHUD();return;
 }
 const dir=keyDirection(keys);const motion=movementForKey(state.s,dir);const inGap=hazardAt(state.s);
 if(inGap&&!safeFromSteam(state.s,state.jump??-1,state.elapsed)){failSteam(inGap);updateHUD();return;}
 if(motion.delta!==0){
  if(!state.started){state.started=true;state.startTime=now;}
  const climbing=['up','down'].includes(motion.segment?.forward);
  const rate=state.jump!==null?1.08:crawlRate(state.crawlClock)*(climbing?.86:1);
  state.crawlClock+=dt;
  const velocity=motion.delta*PLAYER_SPEED*rate*dt;
  let target=motion.delta>0?Math.min(motion.limit,state.s+velocity):Math.max(motion.limit,state.s+velocity);
  const gate=clampAtLockedValve(state.s,target,state.opened);target=gate.s;
  if(gate.blocked&&state.toastUntil<now)toast('🔒 阀门关闭！按 E 打开开闸面板。', '🔒 Locked valve. Press E to open the valve panel.');
  const prev=state.s;state.s=target;
  if(!climbing)state.lastInput=dir;
  const hazard=hazardAt(state.s);
  if(hazard&&!safeFromSteam(state.s,state.jump??-1,state.elapsed)){failSteam(hazard);updateHUD();return;}
  for(const h of HAZARDS){if(prev<h.center+h.halfWidth+24&&state.s>=h.center+h.halfWidth+24)state.passed.add(h.id);}
  state.playerStatus=state.jump!==null?'jump':'move';
 }else state.playerStatus=state.jump!==null?'jump':'idle';
 if(state.jump!==null){state.jump+=dt;if(state.jump>=JUMP_DURATION)state.jump=null;}
 if(reachedPipeExit(state.s,state.opened)){finishLevel();return;}
 updateRats(dt);
 updateHUD();
}
function roundRect(x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,r);}
function drawWorld(now){
 ctx.clearRect(0,0,WIDTH,HEIGHT);
 if(manifest)ctx.drawImage(worldLayer,0,0); else {ctx.fillStyle='#11344a';ctx.fillRect(0,0,WIDTH,HEIGHT);}
 const seconds=now/1000;
 for(const h of HAZARDS){
  const p=routeAt(h.center),vent=steamState(h,state.elapsed);
  drawSteam(p.x,p.y,seconds,h,vent);
  if(!state.passed.has(h.id)){
   const launch=routeAt(h.center-123);ctx.save();ctx.fillStyle=vent.active?'#39281de8':'#103c35e6';ctx.strokeStyle=vent.active?'#f6b47c':'#70edba';ctx.lineWidth=2;
   roundRect(launch.x-49,launch.y-101,98,33,7);ctx.fill();ctx.stroke();ctx.font='bold 16px monospace';ctx.textAlign='center';ctx.fillStyle=vent.active?'#ffe0b4':'#b5ffdb';
   ctx.fillText(vent.active?t('等待','WAIT'):'SPACE ↗',launch.x,launch.y-80);ctx.restore();
  }
  drawVentStatus(p.x,p.y,vent);
 }
 for(const valve of VALVES){
  const x=valve.position[0],y=valve.position[1],unlocked=state.opened[valve.id];
  ctx.save();ctx.strokeStyle=unlocked?'#6cf1c3':'#ffbb75';ctx.globalAlpha=unlocked?.55:.65+.25*Math.sin(seconds*3.7);ctx.lineWidth=4;ctx.shadowColor=unlocked?'#6ef9cf':'#ed9247';ctx.shadowBlur=20;ctx.beginPath();ctx.ellipse(x,y,valve.id==='left'?69:61,64,0,0,Math.PI*2);ctx.stroke();ctx.restore();
  ctx.save();ctx.font='bold 16px system-ui';ctx.textAlign='center';ctx.fillStyle=unlocked?'#b3f4d8':'#ffd49a';ctx.fillText(unlocked ? t('✓ 已开启', '✓ OPEN') : Math.abs(state.s-valve.at)<139 ? t('E · 开阀', 'E · VALVE') : t('◈ 未开启', '◈ LOCKED'), x, y-82);ctx.restore();
 }
 drawRats(now);drawPlayer(now);
 const foreground=images.get('overlays/pipe_foreground_braces.png');if(foreground)ctx.drawImage(foreground,0,0,WIDTH,HEIGHT);
 drawPin(123,812,t('入口','START'),'#9dddc5',seconds);drawPin(1538,790,t('出口','EXIT'),'#a4fbb8',seconds);
 drawAlertMeter();
 if(state.toastUntil>now){ctx.save();ctx.textAlign='center';ctx.font='bold 18px system-ui';roundRect(245,62,1180,47,12);ctx.fillStyle='#102738e5';ctx.fill();ctx.fillStyle='#fff1ca';ctx.fillText(t(...state.toast),835,92,1140);ctx.restore();}
}
function drawAlertMeter(){
 ctx.save();const x=1450,y=106,w=160,h=20;roundRect(x,y,w,h,10);ctx.fillStyle='#0d2030d6';ctx.fill();ctx.strokeStyle='#d08d56';ctx.lineWidth=2;ctx.stroke();
 for(let i=0;i<MAX_ALERT;i++){ctx.fillStyle=i<state.guardAlert?'#ff6e63':'#233949';roundRect(x+8+i*48,y+4,40,12,5);ctx.fill();}
 ctx.font='bold 12px monospace';ctx.textAlign='center';ctx.fillStyle='#ffd6b3';ctx.fillText(`${t('老鼠警觉', 'RAT ALERT')} ${state.guardAlert}/${MAX_ALERT}`,x+w/2,y-7);ctx.restore();
}
function drawVentStatus(x,y,vent){
 ctx.save();ctx.textAlign='center';ctx.font='bold 14px monospace';const label=vent.active?t('♨ 喷气 ','♨ ON '):t('✓ 停喷 ','✓ OFF ');const left=vent.remaining.toFixed(1)+t(' 秒','s');
 ctx.fillStyle=vent.active?'#3a241be9':'#123e38e9';ctx.strokeStyle=vent.active?'#e7a068':'#63dfb7';ctx.lineWidth=2;roundRect(x-64,y-141,128,34,8);ctx.fill();ctx.stroke();ctx.fillStyle=vent.active?'#ffdab1':'#bdffe3';ctx.fillText(label+left,x,y-119);ctx.restore();
}
function drawPin(x,y,text,color,t){ctx.save();ctx.shadowBlur=16;ctx.shadowColor=color;ctx.strokeStyle=color;ctx.fillStyle='#102532bb';ctx.lineWidth=2;const by=y-58+Math.sin(t*3)*3;roundRect(x-36,by-17,72,26,6);ctx.fill();ctx.stroke();ctx.font='bold 12px monospace';ctx.textAlign='center';ctx.fillStyle=color;ctx.fillText(text,x,by+1);ctx.restore();}
function drawSteam(x,y,t,h,vent){
 if(!vent.active){ctx.save();ctx.strokeStyle='#73e8c0a6';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(x-12,y-10);ctx.lineTo(x+12,y-10);ctx.moveTo(x-9,y-1);ctx.lineTo(x+9,y-1);ctx.stroke();ctx.restore();return;}
 ctx.save();ctx.globalCompositeOperation='screen';
 const pulse=1+.14*Math.sin(t*9+h.center*.012);const grd=ctx.createRadialGradient(x,y+10,10,x,y-42,86);
 grd.addColorStop(0,'#fff2c7ee');grd.addColorStop(.22,'#ffd592dd');grd.addColorStop(.5,'#ff9a5ab8');grd.addColorStop(1,'#ff7d3100');
 ctx.fillStyle=grd;ctx.beginPath();ctx.ellipse(x,y-18,78*pulse,94,0,0,Math.PI*2);ctx.fill();
 for(let i=0;i<18;i++){
  const spread=(i-8.5)*6.8;const phase=((t*(110+(i%4)*17)+i*41)%160);const px=x+spread+10*Math.sin(t*6+i);const py=y+10-phase;
  const rw=(i%4===0?10:7)*pulse,rh=(i%4===0?20:14)*pulse;
  ctx.fillStyle=i%3===0?'#fff6dfa8':i%2?'#ffd0a47a':'#ffe9c796';ctx.beginPath();ctx.ellipse(px,py,rw,rh,Math.sin(t*2+i)*.25,0,Math.PI*2);ctx.fill();
 }
 ctx.strokeStyle='#ffd3a2cc';ctx.lineWidth=4;
 for(let i=-2;i<=2;i++){
  ctx.beginPath();ctx.moveTo(x+i*9,y+18);ctx.quadraticCurveTo(x+i*5,y-5,x+i*12+Math.sin(t*7+i)*8,y-58);ctx.quadraticCurveTo(x+i*8,y-88,x+i*15,y-120);ctx.stroke();
 }
 ctx.restore();
}
function drawRats(now){
 for(const rat of state.rats){
  const pos=routeAt(rat.s);const which=ratSpriteFor(rat);const im=images.get('rats/'+which+'.png');if(!im)continue;
  const bob=Math.sin(now/120+rat.id)*1.4;ctx.save();ctx.imageSmoothingEnabled=false;ctx.fillStyle='#07131c55';ctx.beginPath();ctx.ellipse(pos.x,pos.y+16,24,6,0,0,Math.PI*2);ctx.fill();
  const h=(which==='up'||which==='down')?62:48;const w=h*im.width/im.height;
  ctx.drawImage(im,pos.x-w/2,pos.y-h/2+bob,w,h);ctx.restore();
 }
}
function drawPlayer(now){
 const seg=playerSegment(),hopping=state.jump!==null;const height=hopping?jumpHeight(state.jump,JUMP_DURATION):0;const vertical=['ladder','left-rise','right-down'].includes(seg.id);
 const cycle=(state.crawlClock/.42)%1;const moving=state.playerStatus==='move';
 let which='right';
 if(hopping)which=state.lastInput==='left'?'jump_left':'jump_right';
 else if(vertical)which=(moving&&cycle>.46)?'up_b':'up_a';
 else which=seg.id==='middle'?'left':'right';
 const im=images.get('thief/'+which+'.png')||images.get('thief/up.png');if(!im)return;
 const x=seg.x,y=seg.y-height;ctx.save();ctx.imageSmoothingEnabled=false;
 ctx.fillStyle=state.biteFlash>0?'#6f0f1d55':'#04121c58';ctx.beginPath();ctx.ellipse(x,seg.y+21,38,6,0,0,Math.PI*2);ctx.fill();
 const pulling=moving&&cycle<.58;const shift=pulling?Math.sin((cycle/.58)*Math.PI)*2.4:0;
 if(vertical){const h=73,w=h*im.width/im.height;ctx.drawImage(im,x-w/2,y-h/2+shift*.2,w,h);}
 else if(hopping){const h=76,w=h*im.width/im.height;ctx.drawImage(im,x-w/2,y-h/2,w,h);}
 else {const w=pulling?109:106,h=w*im.height/im.width;ctx.drawImage(im,x-w/2,y-h/2+shift,w,h);}
 if(state.biteFlash>0){ctx.globalCompositeOperation='screen';ctx.fillStyle=`rgba(255,80,80,${0.16+state.biteFlash*0.2})`;ctx.fillRect(x-50,y-44,100,88);}ctx.restore();
}
function frame(now){const dt=state.lastTime?Math.min(.04,Math.max(0,(now-state.lastTime)/1000)):0;state.lastTime=now;updateGame(dt,now);drawWorld(now);if(state.modalValve){updateSimHold(now);updateCamera(now);}requestAnimationFrame(frame);}
function updateSimHold(now){if(state.simHeld){const pct=clamp((now-state.keydownSimAt)/1200,0,1);$('demo-meter-fill').style.width=(pct*100)+'%';if(pct>=1){state.simHeld=false;finishValve('keyboard-simulation');}}else $('demo-meter-fill').style.width='0%';}
async function startHandCamera(){
 if(!state.modalValve||state.handCameraActive)return;
 const attempt=++state.cameraAttempt;$('camera-start').disabled=true;setText('gesture-status', '正在载入 MediaPipe 模型并请求摄像头权限…', 'Loading MediaPipe and requesting camera access…');let newlyOpened;
 try{
  if(!navigator.mediaDevices?.getUserMedia)throw Error('Camera access requires localhost or HTTPS.');
  const [mp,stream]=await Promise.all([import(MP_ROOT),navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:'user',width:{ideal:640},height:{ideal:480}}})]);newlyOpened=stream;
  if(attempt!==state.cameraAttempt){stream.getTracks().forEach(t=>t.stop());return;}
  state.stream=stream;const video=$('valve-video');video.srcObject=stream;await video.play();
  if(!state.handModel){const vision=await mp.FilesetResolver.forVisionTasks(MP_ROOT+'/wasm');const opts={baseOptions:{modelAssetPath:HAND_MODEL,delegate:'GPU'},runningMode:'VIDEO',numHands:1,minHandDetectionConfidence:.52,minHandPresenceConfidence:.5,minTrackingConfidence:.5};try{state.handModel=await mp.HandLandmarker.createFromOptions(vision,opts);}catch{state.handModel=await mp.HandLandmarker.createFromOptions(vision,{...opts,baseOptions:{modelAssetPath:HAND_MODEL,delegate:'CPU'}});}}
  if(attempt!==state.cameraAttempt)return;
  state.handCameraActive=true;state.handSeq.reset();state.lastVideoTime=-1;state.lastHandAt=0;$('camera-empty').hidden=true;$('camera-start').disabled=true;$('camera-stop').disabled=false;setText('gesture-tag', '● 实时手势识别', '● REAL CAMERA TRACKING');setText('gesture-status', '请先握拳稳定约半秒，再保持握拳向任意一侧慢慢倾斜约 38°。', 'Hold a fist for half a second, then slowly tilt it about 38° to either side.');
 }catch(err){if(attempt===state.cameraAttempt){setText('gesture-status','摄像头启动失败，可以用 Enter 模拟开闸。','Could not start the camera. Hold Enter to simulate opening the valve.');$('camera-start').disabled=false;}else newlyOpened?.getTracks().forEach(t=>t.stop());}
}
function drawHand(points){const cv=$('hand-overlay'),c=cv.getContext('2d');c.clearRect(0,0,cv.width,cv.height);if(!points)return;c.strokeStyle='#93ffde';c.lineWidth=3;c.beginPath();for(const [a,b] of CONNS){c.moveTo(points[a].x*cv.width,points[a].y*cv.height);c.lineTo(points[b].x*cv.width,points[b].y*cv.height);}c.stroke();points.forEach(p=>{c.fillStyle='#ffe2a3';c.beginPath();c.arc(p.x*cv.width,p.y*cv.height,4,0,Math.PI*2);c.fill();});}
function updateCamera(now){
 if(!state.handCameraActive||!state.modalValve||!state.handModel)return;
 const video=$('valve-video');
 if(video.readyState<2||state.lastVideoTime===video.currentTime||now-state.lastHandAt<85)return;
 state.lastHandAt=now;
 state.lastVideoTime=video.currentTime;

 try{
  const result=state.handModel.detectForVideo(video,now);
  const points=result.landmarks?.[0]??null;
  drawHand(points);
  const gesture=state.handSeq.update(points,now);
  if(gesture.phase==='grip'){
   setText('gesture-step','01 / 握住阀门','01 / Grip the valve');
   $('gesture-picture').textContent='✊';
   setText('gesture-name','持续握拳','Hold a fist');
   setText('gesture-instruction','让手完整入镜，握拳约 0.55 秒。','Keep your whole hand in view and hold a fist for about 0.55 seconds.');
   $('gesture-meter').style.width=`${gesture.gripProgress*48}%`;
   const progress=Math.round(gesture.gripProgress*100);
   if(gesture.fist) setText('gesture-status',`正在抓紧阀门… ${progress}%`,`Gripping… ${progress}%`);
   else setText('gesture-status','握拳，至少弯曲三根手指','Make a fist with at least three fingers bent');
  }else{
   setText('gesture-step','02 / 旋转阀门','02 / Turn the valve');
   $('gesture-picture').textContent='↻';
   setText('gesture-name','保持握拳，缓慢侧倾','Hold a fist and tilt slowly');
   setText('gesture-instruction','保持拳头朝向摄像头，向左或右倾斜约 38°。','Keep your fist facing the camera and tilt it about 38° left or right.');
   $('gesture-meter').style.width=`${48+gesture.turnProgress*52}%`;
   setText('gesture-status',`已旋转 ${gesture.angle}° / 38°`,`Turned ${gesture.angle}° / 38°`);
  }
  if(gesture.done)finishValve('camera');
 }catch(error){
  setText('gesture-status','手势识别暂时中断','Hand tracking interrupted');
  console.error(error);
 }
}
$('camera-start').addEventListener('click',startHandCamera);$('camera-stop').addEventListener('click',stopHandCamera);$('close-modal').addEventListener('click',closeValve);$('cancel-valve').addEventListener('click',closeValve);$('reload-room').addEventListener('click',()=>window.location.reload());$('valve-modal').addEventListener('pointerdown',e=>{if(e.target===$('valve-modal'))closeValve();});$('camera-stop').disabled=true;
preload();updateHUD();requestAnimationFrame(frame);

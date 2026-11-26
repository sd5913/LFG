import { createFrameLocale } from '../../src/game-locale.js';
import { GAME_CAMERA_EVENT, requestGameCamera, stopGameCamera } from '../../src/game-camera.js';
import {DIR_OPPOSITE,TOTAL_LENGTH,HAZARDS,VALVES,routeAt,clamp,JUMP_DURATION,jumpHeight,hazardAt,movementForKey,keyDirection,clampAtLockedValve,steamState,resolveSteamMove,ratSpawnDelay,ratCanBite,CRAWL_STROKE_SECONDS,crawlRate,reachedPipeExit} from './route.js';
import {ValveGestureSequence} from './gesture-valve.js';
const $=id=>document.getElementById(id);
const {t, setText} = createFrameLocale();
const canvas=$('game'),ctx=canvas.getContext('2d',{alpha:false});
const WIDTH=1671,HEIGHT=941,PLAYER_SPEED=218,RAT_SPEED=248;
const LANDING_INPUT_WINDOW=.16;
const DAMAGE_ALERT=30,MAX_ALERT=100,HURT_SECONDS=2;
const EMBEDDED=window.parent!==window;
// Measure the opaque sprite bounds and hat width in source pixels for each pose.
const PLAYER_HAT_WIDTH=34;
const PLAYER_ART={
 left:{bounds:[0,0,219,104],hatWidth:81},
 right:{bounds:[0,0,219,104],hatWidth:81},
 jump_left:{bounds:[34,31,211,203],hatWidth:100},
 jump_right:{bounds:[33,31,211,203],hatWidth:100},
 up_a:{bounds:[80,28,118,215],hatWidth:81},
 up_b:{bounds:[80,28,118,216],hatWidth:81},
};
const CRAWL_BODY_WIDTH=PLAYER_ART.right.bounds[2]*PLAYER_HAT_WIDTH/PLAYER_ART.right.hatWidth;
const keys=new Set();const images=new Map();let manifest=null;
let sharedCameraStream=null;
let publishedAlert=null;
const state={
 s:0,jump:null,jumpQueued:false,opened:{left:false,right:false},passed:new Set(),retries:0,running:true,started:false,elapsed:0,lastTime:0,
 modalValve:null,toast:'',toastUntil:0,playerStatus:'idle',lastInput:'right',cameraAttempt:0,stream:null,ownsStream:false,handModel:null,
 handSeq:new ValveGestureSequence(),lastVideoTime:-1,lastHandAt:0,handCameraActive:false,keydownSimAt:null,simHeld:false,
 valveModes:{},crawlClock:0,hurtTimer:0,hurtBy:null,failedGap:null,guardAlert:0,biteTotal:0,
 rats:[],ratId:0,nextRatSpawn:ratSpawnDelay()
};
let audio;const worldLayer=document.createElement('canvas');worldLayer.width=WIDTH;worldLayer.height=HEIGHT;const worldCtx=worldLayer.getContext('2d');
let foregroundLayer;
const MP_VERSION='0.10.14';
const MP_ROOT=`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}`;
const HAND_MODEL='https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const CONNS=[[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];
function sound(freq=570,duration=.12,type='sine'){try{audio??=new (window.AudioContext||window.webkitAudioContext)();const a=audio;if(a.state==='suspended')a.resume().catch(()=>{});const o=a.createOscillator(),g=a.createGain();o.type=type;o.frequency.value=freq;g.gain.setValueAtTime(.0001,a.currentTime);g.gain.exponentialRampToValueAtTime(.075,a.currentTime+.015);g.gain.exponentialRampToValueAtTime(.0001,a.currentTime+duration);o.connect(g);g.connect(a.destination);o.start();o.stop(a.currentTime+duration+.01);}catch{}}
function toast(zh,en){state.toast=[zh,en];state.toastUntil=performance.now()+2600;}
function playerSegment(){return routeAt(state.s);}
async function preload(){
 try{
  const res=await fetch('assets/manifest.json');if(!res.ok)throw new Error('Could not read manifest.json');manifest=await res.json();
  const names=['background/room_01_background_no_gameplay_components.png',...manifest.sprites.map(s=>s.file),
   ...Object.keys(PLAYER_ART).map(n=>'thief/'+n+'.png'),
   ...['down','left','right','up'].map(n=>'rats/'+n+'.png'),
   'overlays/pipe_repairs_ladders.png','overlays/pipe_foreground_braces.png'];
  await Promise.all([...new Set(names)].map(name=>new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>{images.set(name,img);resolve();};img.onerror=()=>reject(Error('Could not load '+name));img.src='assets/'+name;})));
  const background=images.get('background/room_01_background_no_gameplay_components.png');
  worldCtx.drawImage(background,0,0,WIDTH,HEIGHT);
  for(const sprite of manifest.sprites){const img=images.get(sprite.file);if(img)worldCtx.drawImage(img,sprite.original_x,sprite.original_y,sprite.width,sprite.height);}
  worldCtx.drawImage(images.get('overlays/pipe_repairs_ladders.png'),0,0,WIDTH,HEIGHT);

  foregroundLayer=document.createElement('canvas');
  foregroundLayer.width=WIDTH;foregroundLayer.height=HEIGHT;
  const foregroundCtx=foregroundLayer.getContext('2d');
  foregroundCtx.drawImage(images.get('overlays/pipe_foreground_braces.png'),0,0);
  for(const sprite of manifest.sprites){
   if(!sprite.top_rail_cutout)continue;
   const [offsetX,offsetY,width,height]=sprite.top_rail_cutout;
   const x=sprite.original_x+offsetX,y=sprite.original_y+offsetY;
   // Reveal the room behind the opening and remove the duplicate rail above the steam.
   worldCtx.drawImage(background,x,y,width,height,x,y,width,height);
   foregroundCtx.clearRect(x,y,width,height);
  }
 }catch(err){
  setText('load-error-detail','请重新加载页面并检查游戏资源。','Reload the page and check that the game assets are available.');
  $('load-error').hidden=false;
  console.error(err);
 }
}
function pointerInput(k,on){if(on){keys.add(k);if(k==='KeyE')openNearbyValve();if(k==='Space')startJump();}else keys.delete(k);}
window.addEventListener('keydown',e=>{
 const k=e.code;
 if(e.target===$('retry-pipe')&&(k==='Space'||k==='Enter'))return;
 if(['ArrowRight','ArrowLeft','ArrowUp','ArrowDown','Space','Enter','KeyW','KeyA','KeyS','KeyD','KeyE','Escape'].includes(k))e.preventDefault();
 if(state.modalValve){if(k==='Escape')closeValve();if(k==='Enter'&&!state.simHeld){state.simHeld=true;state.keydownSimAt=performance.now();}return;}
 if(k==='KeyR'&&!e.repeat){restart();return;}
 keys.add(k);if(k==='Space'&&!e.repeat)startJump();if(k==='KeyE'&&!e.repeat)openNearbyValve();
});
window.addEventListener('keyup',e=>{keys.delete(e.code);if(e.code==='Enter')state.simHeld=false;});
window.addEventListener('blur',()=>{keys.clear();state.simHeld=false;state.jumpQueued=false;});
document.querySelectorAll('[data-key]').forEach(el=>{const k=el.dataset.key;el.addEventListener('pointerdown',e=>{e.preventDefault();el.setPointerCapture(e.pointerId);pointerInput(k,true);});for(const type of ['pointerup','pointercancel','lostpointercapture'])el.addEventListener(type,()=>pointerInput(k,false));});
function restart(){
 keys.clear();$('pipe-caught').hidden=true;
 state.s=0;state.jump=null;state.jumpQueued=false;state.opened={left:false,right:false};state.passed=new Set();state.retries=0;state.running=true;state.started=false;
 state.elapsed=0;state.playerStatus='idle';state.lastInput='right';state.crawlClock=0;state.hurtTimer=0;state.hurtBy=null;state.failedGap=null;state.guardAlert=0;state.biteTotal=0;
 state.rats=[];state.ratId=0;state.nextRatSpawn=ratSpawnDelay();state.valveModes={};toast('重新开始：沿下水管道潜入！', 'Restarted. Follow the pipes into the museum!');
}
function startJump(){
 if(!state.running||state.modalValve||state.hurtTimer>0)return;
 if(state.jump!==null){
  if(state.jump>=JUMP_DURATION-LANDING_INPUT_WINDOW)state.jumpQueued=true;
  return;
 }
 state.jump=0;state.playerStatus='jump';sound(560,.10,'triangle');
}
function takeDamage(source){
 state.guardAlert=Math.min(MAX_ALERT,state.guardAlert+DAMAGE_ALERT);
 state.hurtTimer=HURT_SECONDS;state.hurtBy=source;state.jump=null;state.jumpQueued=false;state.playerStatus='hurt';
 if(source==='rat'){
  state.failedGap=hazardAt(state.s,CRAWL_BODY_WIDTH);
  state.biteTotal++;sound(165,.22,'square');
  toast('被老鼠咬伤！警戒上升 '+state.guardAlert+'%', 'Rat bite! Alert: '+state.guardAlert+'%');
 }else{
  state.retries++;sound(125,.35,'sawtooth');
  const [zh,en]=source==='steam'?['被蒸汽烫到！','Hit by steam!']:['未能跳过断口！','Missed the jump!'];
  toast(zh+'警戒上升 '+state.guardAlert+'%',en+' Alert: '+state.guardAlert+'%');
 }
}
function finishCaught(){
 state.running=false;keys.clear();sound(120,.26,'sawtooth');
 $('pipe-caught').hidden=false;
 $('retry-pipe').focus();
}
function openNearbyValve(){
 if(state.modalValve||!state.running||state.hurtTimer>0)return;
 const valve=VALVES.find(v=>!state.opened[v.id]&&Math.abs(state.s-v.at)<139);
 if(!valve){toast('附近没有需要开启的阀门。', 'There is no locked valve nearby.');return;}
 state.modalValve=valve;state.simHeld=false;state.keydownSimAt=null;state.jumpQueued=false;state.handSeq.reset();
 setText('modal-heading', `${valve.name} · 手势开闸`, `${valve.nameEn} · Gesture unlock`);$('gesture-meter').style.width='0%';$('demo-meter-fill').style.width='0%';
 setText('gesture-step', '01 · 握住手柄', '01 · GRIP THE HANDLE');$('gesture-picture').textContent='✊';setText('gesture-name', '第一步：握拳', 'Step 1: Make a fist');setText('gesture-instruction', '对着摄像头握拳约半秒，模拟抓住阀门手柄。', 'Hold a fist for about half a second to grip the handle.');
 $('valve-modal').hidden=false;keys.clear();sound(390,.13);
 showValveCameraHint();
 if(sharedCameraStream)startHandCamera();
}
function showValveCameraHint(){
 if(EMBEDDED)setText('gesture-status','请在顶部栏开启摄像头，或按住 Enter 模拟开阀。','Enable the camera in the top bar, or hold Enter to simulate opening the valve.');
 else setText('gesture-status','等待真实摄像头，或按住 Enter 测试开闸逻辑。','Use the camera or hold Enter to simulate opening the valve.');
}
function stopHandCamera(){
 ++state.cameraAttempt;state.handCameraActive=false;
 if(state.ownsStream)stopGameCamera(state.stream);
 state.stream=null;state.ownsStream=false;
 const v=$('valve-video');v.pause();v.srcObject=null;
 $('hand-overlay').getContext('2d').clearRect(0,0,640,480);
 $('camera-empty').hidden=false;$('camera-start').disabled=false;$('camera-stop').disabled=true;setText('gesture-tag', '等待手势', 'NO HAND INPUT');
}
function closeValve(){const had=state.modalValve;state.modalValve=null;state.simHeld=false;state.keydownSimAt=null;$('valve-modal').hidden=true;stopHandCamera();if(had&&!state.opened[had.id])toast('阀门尚未开启，可以随时再试。', 'The valve is still locked. You can try again.');}
function finishValve(mode){
 const valve=state.modalValve;if(!valve||state.opened[valve.id])return;
 state.opened[valve.id]=true;state.valveModes[valve.id]=mode;
 sound(760,.16);setTimeout(()=>sound(1070,.18),150);
 toast(`${valve.name}已开启 · 继续前进`, `${valve.nameEn} opened · Keep moving`);
 closeValve();
 window.dispatchEvent(new CustomEvent('lfg:pipe-valve-opened',{detail:{valveId:valve.id,source:mode}}));
}
function finishLevel(){
 if(!state.running)return;state.running=false;state.s=TOTAL_LENGTH;keys.clear();state.rats=[];
 const detail={timeSeconds:+state.elapsed.toFixed(1),retries:state.retries,valves:state.valveModes,steamCleared:state.passed.size,ratBites:state.biteTotal};
 window.dispatchEvent(new CustomEvent('lfg:pipe-room-complete',{detail}));
 if(EMBEDDED)window.parent.postMessage({type:'lfg:pipe-room-complete',detail},window.location.origin);
 else window.location.assign(new URL('../?stage=museum',window.location.href));
}
function publishAlert(){
 if(!EMBEDDED||publishedAlert===state.guardAlert)return;
 publishedAlert=state.guardAlert;
 window.parent.postMessage({type:'lfg:pipe-room-alert',alertLevel:state.guardAlert},window.location.origin);
}
function updateRats(dt){
 if(!state.started)return;
 for(const rat of state.rats){
  rat.s=Math.max(0,rat.s-RAT_SPEED*dt);
  if(state.hurtTimer<=0&&ratCanBite(state.s,rat.s,state.jump??-1))takeDamage('rat');
 }
 state.rats=state.rats.filter(rat=>rat.s>0);
 state.nextRatSpawn-=dt;
 if(state.nextRatSpawn<=0){
  state.rats.push({id:++state.ratId,s:TOTAL_LENGTH});
  state.nextRatSpawn+=ratSpawnDelay();
 }
}
function updateGame(dt,now){
 if(!state.running||state.modalValve)return;
 if(state.started)state.elapsed+=dt;
 if(state.hurtTimer>0){
  updateRats(dt);
  state.hurtTimer=Math.max(0,state.hurtTimer-dt);
  if(state.hurtTimer===0){
   state.hurtBy=null;
   if(state.guardAlert>=MAX_ALERT)finishCaught();
  }
  return;
 }
 const dir=keyDirection(keys),motion=movementForKey(state.s,dir);
 const prev=state.s;
 let target=prev;
 if(motion.delta!==0){
  state.started=true;
  const climbing=['up','down'].includes(motion.segment?.forward);
  const rate=climbing?crawlRate(state.crawlClock)*.86:state.jump!==null?1.08:crawlRate(state.crawlClock);
  state.crawlClock+=dt;
  const velocity=motion.delta*PLAYER_SPEED*rate*dt;
  target=motion.delta>0?Math.min(motion.limit,prev+velocity):Math.max(motion.limit,prev+velocity);
  const gate=clampAtLockedValve(prev,target,state.opened);target=gate.s;
  if(gate.blocked&&state.toastUntil<now)toast('🔒 阀门关闭！按 E 打开开闸面板。', '🔒 Locked valve. Press E to open the valve panel.');
  if(!climbing)state.lastInput=dir;
 }
 const nextJumpTime=state.jump===null?null:state.jump+dt;
 const landed=nextJumpTime!==null&&nextJumpTime>=JUMP_DURATION;
 const move=resolveSteamMove(prev,target,CRAWL_BODY_WIDTH,nextJumpTime!==null&&!landed,state.elapsed,state.failedGap);
 state.s=move.s;state.failedGap=move.failedGap;
 if(move.hit){takeDamage(move.hit);updateRats(dt);return;}
 for(const h of HAZARDS){if(prev<h.opening[1]+24&&state.s>=h.opening[1]+24)state.passed.add(h.id);}
 state.jump=landed?null:nextJumpTime;
 state.playerStatus=state.jump!==null?'jump':state.s!==prev?'move':'idle';
 updateRats(dt);
 if(state.hurtTimer>0)return;
 if(reachedPipeExit(state.s,state.opened)){finishLevel();return;}
 if(landed&&state.jumpQueued){
  state.jumpQueued=false;
  startJump();
 }
}
function roundRect(x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,r);}
function drawWorld(now){
 ctx.clearRect(0,0,WIDTH,HEIGHT);
 if(manifest)ctx.drawImage(worldLayer,0,0); else {ctx.fillStyle='#11344a';ctx.fillRect(0,0,WIDTH,HEIGHT);}
 const seconds=now/1000;
 for(const h of HAZARDS){
  const p=routeAt(h.center),vent=steamState(h,state.elapsed);
  drawSteam(p.x,p.y,seconds,h,vent);
 }
 for(const valve of VALVES){
  const x=valve.position[0],y=valve.position[1],unlocked=state.opened[valve.id];
  ctx.save();ctx.strokeStyle=unlocked?'#6cf1c3':'#ffbb75';ctx.globalAlpha=unlocked?.55:.65+.25*Math.sin(seconds*3.7);ctx.lineWidth=4;ctx.shadowColor=unlocked?'#6ef9cf':'#ed9247';ctx.shadowBlur=20;ctx.beginPath();ctx.ellipse(x,y,valve.id==='left'?69:61,64,0,0,Math.PI*2);ctx.stroke();ctx.restore();
  ctx.save();ctx.font='bold 16px system-ui';ctx.textAlign='center';ctx.fillStyle=unlocked?'#b3f4d8':'#ffd49a';ctx.fillText(unlocked ? t('✓ 已开启', '✓ OPEN') : Math.abs(state.s-valve.at)<139 ? t('E · 开阀', 'E · VALVE') : t('◈ 未开启', '◈ LOCKED'), x, y-82);ctx.restore();
 }
 drawRats(now);drawPlayer();
 if(foregroundLayer)ctx.drawImage(foregroundLayer,0,0);
 drawPin(123,812,t('入口','START'),'#9dddc5',seconds);drawPin(1538,790,t('出口','EXIT'),'#a4fbb8',seconds);
 if(!EMBEDDED)drawAlertMeter();
 if(state.toastUntil>now){ctx.save();ctx.textAlign='center';ctx.font='bold 18px system-ui';roundRect(245,62,1180,47,12);ctx.fillStyle='#102738e5';ctx.fill();ctx.fillStyle='#fff1ca';ctx.fillText(t(...state.toast),835,92,1140);ctx.restore();}
}
function drawAlertMeter(){
 ctx.save();const x=1450,y=106,w=160,h=20;roundRect(x,y,w,h,10);ctx.fillStyle='#0d2030d6';ctx.fill();ctx.strokeStyle='#d08d56';ctx.lineWidth=2;ctx.stroke();
 roundRect(x+4,y+4,w-8,h-8,5);ctx.fillStyle='#233949';ctx.fill();ctx.clip();
 ctx.fillStyle='#ff6e63';ctx.fillRect(x+4,y+4,(w-8)*state.guardAlert/MAX_ALERT,h-8);ctx.restore();
 ctx.save();ctx.font='bold 12px monospace';ctx.textAlign='center';ctx.fillStyle='#ffd6b3';ctx.fillText(`${t('警戒', 'ALERT')} ${state.guardAlert}%`,x+w/2,y-7);ctx.restore();
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
  const pos=routeAt(rat.s),which=DIR_OPPOSITE[routeAt(rat.s-.001).forward];const im=images.get('rats/'+which+'.png');if(!im)continue;
  const bob=Math.sin(now/120+rat.id)*1.4;ctx.save();ctx.imageSmoothingEnabled=false;ctx.fillStyle='#07131c55';ctx.beginPath();ctx.ellipse(pos.x,pos.y+16,24,6,0,0,Math.PI*2);ctx.fill();
  const h=(which==='up'||which==='down')?62:48;const w=h*im.width/im.height;
  ctx.drawImage(im,pos.x-w/2,pos.y-h/2+bob,w,h);ctx.restore();
 }
}
function drawPlayer(){
 const seg=playerSegment(),hopping=state.jump!==null;const height=hopping?jumpHeight(state.jump):0;const vertical=['ladder','left-rise','right-down'].includes(seg.id);
 const cycle=(state.crawlClock/CRAWL_STROKE_SECONDS)%1;const moving=state.playerStatus==='move';
 let which=state.lastInput;
 if(vertical)which=(moving&&cycle>.46)?'up_b':'up_a';
 else if(hopping)which=state.lastInput==='left'?'jump_left':'jump_right';
 const im=images.get('thief/'+which+'.png');if(!im)return;
 const {bounds,hatWidth}=PLAYER_ART[which],scale=PLAYER_HAT_WIDTH/hatWidth;
 const width=bounds[2]*scale,spriteHeight=bounds[3]*scale;
 const bob=moving&&!vertical?Math.sin(cycle*Math.PI*2)*.8:0;
 const side=state.lastInput==='left'?-1:1;
 const x=seg.x+(vertical?side*height*.55:0),y=seg.y-(vertical?0:height);
 ctx.save();ctx.imageSmoothingEnabled=false;
 ctx.fillStyle='#04121c58';ctx.beginPath();ctx.ellipse(seg.x,seg.y+21,38,6,0,0,Math.PI*2);ctx.fill();
 if(state.hurtTimer>0){
  if(Math.floor((HURT_SECONDS-state.hurtTimer)/.25)%2===1)ctx.globalAlpha=.24;
  if(state.hurtBy==='rat')ctx.filter='sepia(1) saturate(8) hue-rotate(322deg) brightness(1.1)';
 }
 ctx.drawImage(im,...bounds,x-width/2,y-spriteHeight/2+bob,width,spriteHeight);
 ctx.restore();
}
function frame(now){const dt=state.lastTime?Math.min(.04,Math.max(0,(now-state.lastTime)/1000)):0;state.lastTime=now;updateGame(dt,now);publishAlert();drawWorld(now);if(state.modalValve){updateSimHold(now);updateCamera(now);}requestAnimationFrame(frame);}
function updateSimHold(now){if(state.simHeld){const pct=clamp((now-state.keydownSimAt)/1200,0,1);$('demo-meter-fill').style.width=(pct*100)+'%';if(pct>=1){state.simHeld=false;finishValve('keyboard-simulation');}}else $('demo-meter-fill').style.width='0%';}
async function startHandCamera(){
 if(!state.modalValve||$('camera-start').disabled||(EMBEDDED&&!sharedCameraStream))return;
 const attempt=++state.cameraAttempt,sharedStream=sharedCameraStream;
 $('camera-start').disabled=true;setText('gesture-status','正在启动手势识别…','Starting hand tracking…');
 try{
  const stream=sharedStream??await requestGameCamera();
  if(attempt!==state.cameraAttempt){if(!sharedStream)stopGameCamera(stream);return;}
  state.stream=stream;state.ownsStream=!sharedStream;
  const video=$('valve-video');video.srcObject=stream;await video.play();
  if(!state.handModel&&attempt===state.cameraAttempt){
   const mp=await import(MP_ROOT);
   const vision=await mp.FilesetResolver.forVisionTasks(MP_ROOT+'/wasm');
   const opts={baseOptions:{modelAssetPath:HAND_MODEL,delegate:'GPU'},runningMode:'VIDEO',numHands:1,minHandDetectionConfidence:.52,minHandPresenceConfidence:.5,minTrackingConfidence:.5};
   let model;
   try{model=await mp.HandLandmarker.createFromOptions(vision,opts);}
   catch{model=await mp.HandLandmarker.createFromOptions(vision,{...opts,baseOptions:{modelAssetPath:HAND_MODEL,delegate:'CPU'}});}
   if(attempt!==state.cameraAttempt){model.close();return;}
   state.handModel=model;
  }
  if(attempt!==state.cameraAttempt)return;
  state.handCameraActive=true;state.handSeq.reset();state.lastVideoTime=-1;state.lastHandAt=0;$('camera-empty').hidden=true;$('camera-start').disabled=true;$('camera-stop').disabled=false;setText('gesture-tag', '● 实时手势识别', '● REAL CAMERA TRACKING');setText('gesture-status', '请先握拳稳定约半秒，再保持握拳向任意一侧慢慢倾斜约 38°。', 'Hold a fist for half a second, then slowly tilt it about 38° to either side.');
 }catch{
  if(attempt!==state.cameraAttempt)return;
  stopHandCamera();
  setText('gesture-status','手势识别启动失败，可以按住 Enter 模拟开阀。','Could not start hand tracking. Hold Enter to simulate opening the valve.');
 }
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
$('camera-start').addEventListener('click',startHandCamera);$('camera-stop').addEventListener('click',stopHandCamera);$('close-modal').addEventListener('click',closeValve);$('cancel-valve').addEventListener('click',closeValve);$('reload-room').addEventListener('click',()=>window.location.reload());$('retry-pipe').addEventListener('click',restart);$('valve-modal').addEventListener('pointerdown',e=>{if(e.target===$('valve-modal'))closeValve();});$('camera-stop').disabled=true;
if(EMBEDDED){
 document.documentElement.classList.add('pipe-in-game');
 $('camera-start').hidden=true;$('camera-stop').hidden=true;
 window.addEventListener(GAME_CAMERA_EVENT,({detail:stream})=>{
  if(sharedCameraStream===stream)return;
  sharedCameraStream=stream;
  if(!state.modalValve)return;
  stopHandCamera();
  if(sharedCameraStream)startHandCamera();
  else showValveCameraHint();
 });
}
preload();requestAnimationFrame(frame);

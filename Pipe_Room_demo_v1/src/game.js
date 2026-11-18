import {SEGMENTS,TOTAL_LENGTH,HAZARDS,VALVES,routeAt,clamp,jumpHeight,hazardAt,movementForKey,keyDirection,clampAtLockedValve} from './route.js';
import {ValveGestureSequence} from './gesture-valve.js';
const $=id=>document.getElementById(id);
const canvas=$('game'),ctx=canvas.getContext('2d',{alpha:false});
const WIDTH=1671,HEIGHT=941,PLAYER_SPEED=272,JUMP_DURATION=.94;
const keys=new Set();const images=new Map();let manifest=null;
const state={s:0,jump:null,opened:{left:false,right:false},passed:new Set(),retries:0,running:true,started:false,startTime:0,elapsed:0,lastTime:0,modalValve:null,toast:'',toastUntil:0,playerStatus:'idle',lastInput:'right',cameraAttempt:0,stream:null,handModel:null,handSeq:new ValveGestureSequence(),lastVideoTime:-1,lastHandAt:0,handCameraActive:false,keydownSimAt:null,simHeld:false,valveModes:{},muted:false};
let audio;const worldLayer=document.createElement('canvas');worldLayer.width=WIDTH;worldLayer.height=HEIGHT;const worldCtx=worldLayer.getContext('2d');
const MP_VERSION='0.10.14';
const MP_ROOT=`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}`;
const HAND_MODEL='https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const CONNS=[[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];
function sound(freq=570,duration=.12,type='sine'){try{audio??=new (window.AudioContext||window.webkitAudioContext)();const a=audio;if(a.state==='suspended')a.resume().catch(()=>{});const o=a.createOscillator(),g=a.createGain();o.type=type;o.frequency.value=freq;g.gain.setValueAtTime(.0001,a.currentTime);g.gain.exponentialRampToValueAtTime(.075,a.currentTime+.015);g.gain.exponentialRampToValueAtTime(.0001,a.currentTime+duration);o.connect(g);g.connect(a.destination);o.start();o.stop(a.currentTime+duration+.01);}catch{}}
function toast(text){state.toast=text;state.toastUntil=performance.now()+2400;}
function playerSegment(){return routeAt(state.s);}
function setPrompt(title,detail){$('prompt-title').textContent=title;$('prompt-desc').textContent=detail;}
async function preload(){
 try{
  const res=await fetch('assets/manifest.json');if(!res.ok)throw new Error('manifest.json 无法读取');manifest=await res.json();
  const names=['background/room_01_background_no_gameplay_components.png',...manifest.sprites.map(s=>s.file),...['right','left','up','jump'].map(n=>'thief/'+n+'.png')];
  await Promise.all([...new Set(names)].map(name=>new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>{images.set(name,img);resolve();};img.onerror=()=>reject(Error(name+' 加载失败'));img.src='assets/'+name;})));
  const background=images.get('background/room_01_background_no_gameplay_components.png');
  worldCtx.drawImage(background,0,0,WIDTH,HEIGHT);
  for(const sprite of manifest.sprites){const img=images.get(sprite.file);if(img)worldCtx.drawImage(img,sprite.original_x,sprite.original_y,sprite.width,sprite.height);}
  toast('地图素材加载完成 · 左下入口出发');
 }catch(err){setPrompt('素材加载失败','请通过 npm start 启动，不要双击打开 HTML · '+err.message);console.error(err);}
}
function pointerInput(k,on){if(on){keys.add(k);if(k==='KeyE')openNearbyValve();if(k==='Space')startJump();}else keys.delete(k);}
window.addEventListener('keydown',e=>{
 const k=e.code;
 if(['ArrowRight','ArrowLeft','ArrowUp','ArrowDown','Space','Enter','KeyW','KeyA','KeyS','KeyD','KeyE','Escape'].includes(k))e.preventDefault();
 if(state.modalValve){if(k==='Escape')closeValve();if(k==='Enter'&&!state.simHeld){state.simHeld=true;state.keydownSimAt=performance.now();}return;}
 keys.add(k);if(k==='Space'&&!e.repeat)startJump();if(k==='KeyE'&&!e.repeat)openNearbyValve();
});
window.addEventListener('keyup',e=>{keys.delete(e.code);if(e.code==='Enter')state.simHeld=false;});
window.addEventListener('blur',()=>{keys.clear();state.simHeld=false;});
document.querySelectorAll('[data-key]').forEach(el=>{const k=el.dataset.key;el.addEventListener('pointerdown',e=>{e.preventDefault();el.setPointerCapture(e.pointerId);pointerInput(k,true);});for(const type of ['pointerup','pointercancel','lostpointercapture'])el.addEventListener(type,()=>pointerInput(k,false));});
function restart(){state.s=0;state.jump=null;state.opened={left:false,right:false};state.passed=new Set();state.retries=0;state.running=true;state.started=false;state.elapsed=0;state.playerStatus='idle';state.valveModes={};$('result').hidden=true;toast('重新开始：沿下水管道潜入！');updateHUD();}
function startJump(){if(!state.running||state.modalValve||state.jump!==null)return;const seg=playerSegment();if(!['left','right'].includes(seg.forward))return;state.jump=0;state.playerStatus='jump';sound(560,.10,'triangle');}
function failSteam(h){
 state.retries++;sound(125,.35,'sawtooth');
 const seg=SEGMENTS.find(s=>s.id===h.segment);
 // Checkpoint immediately before the same steam trap, so retry remains fair.
 state.s=Math.max(seg.start+8,h.center-h.halfWidth-105);
 state.jump=null;state.playerStatus='hurt';toast('被持续喷气烫到了！回到断管前的安全位置重试。');
}
function openNearbyValve(){
 if(state.modalValve||!state.running)return;
 const valve=VALVES.find(v=>!state.opened[v.id]&&Math.abs(state.s-v.at)<139);
 if(!valve){toast('附近没有需要开启的阀门。');return;}
 state.modalValve=valve;state.simHeld=false;state.keydownSimAt=null;state.handSeq.reset();
 $('modal-heading').textContent=valve.name+' · 手势开闸';$('gesture-meter').style.width='0%';$('demo-meter-fill').style.width='0%';
 $('gesture-step').textContent='01 · GRIP THE HANDLE';$('gesture-picture').textContent='✊';$('gesture-name').textContent='第一步：握拳';$('gesture-instruction').textContent='对着摄像头握拳约半秒，模拟抓住阀门手柄。';
 $('gesture-status').textContent='等待真实摄像头，或按住 Enter 测试开闸逻辑。';
 $('valve-modal').hidden=false;keys.clear();
 sound(390,.13);setPrompt('正在开启阀门',valve.name);
}
async function stopHandCamera(){
 ++state.cameraAttempt;state.handCameraActive=false;
 if(state.stream){state.stream.getTracks().forEach(t=>t.stop());state.stream=null;}
 const v=$('valve-video');v.pause();v.srcObject=null;
 $('hand-overlay').getContext('2d').clearRect(0,0,640,480);
 $('camera-empty').hidden=false;$('camera-start').disabled=false;$('camera-stop').disabled=true;$('gesture-tag').textContent='NO HAND INPUT';
}
async function closeValve(){const had=state.modalValve;state.modalValve=null;state.simHeld=false;state.keydownSimAt=null;$('valve-modal').hidden=true;await stopHandCamera();if(had&&!state.opened[had.id])toast('阀门尚未开启，可以随时再试。');}
function finishValve(mode){
 const valve=state.modalValve;if(!valve||state.opened[valve.id])return;
 state.opened[valve.id]=true;state.valveModes[valve.id]=mode;
 sound(760,.16);setTimeout(()=>sound(1070,.18),150);
 toast(`${valve.name} 已开启！${mode==='camera'?'真实摄像头手势成功':'键盘模拟测试成功'}，可以继续前进。`);
 closeValve();updateHUD();
 window.dispatchEvent(new CustomEvent('lfg:pipe-valve-opened',{detail:{valveId:valve.id,source:mode}}));
}
function statusHint(now){
 if(state.modalValve)return;
 const seg=playerSegment(),s=state.s;
 const locked=VALVES.find(v=>!state.opened[v.id]&&v.at-s<126&&v.at-s>=-15);
 if(locked){setPrompt('🔒 '+locked.name,'到达阀门后按 E → 握拳并旋转手腕，或在弹窗中用 Enter 模拟测试');return;}
 const h=HAZARDS.find(h=>Math.abs(h.center-s)<190&&!state.passed.has(h.id));
 if(h){setPrompt('♨ 持续喷气！','在橙色断口前按 SPACE 起跳；不要直接爬过去。');return;}
 if(seg.id==='bottom'&&seg.t>.89){setPrompt('↑ 找到梯子','到达底层管道最右端，按 ↑ 或 W 沿梯子攀爬。');return;}
 if(seg.id==='ladder'){setPrompt('↑ 攀爬中','保持 ↑ 或 W，沿管道内的梯子爬上中层。');return;}
 if(seg.id==='middle'&&seg.t>.91){setPrompt('↑ 沿左侧弯管上升','到达中层左端后按 ↑ 或 W，沿竖直管道爬到顶层。');return;}
 if(seg.id==='left-rise'){setPrompt('↑ 上升管道','保持 ↑ 或 W；只能在这段管道里移动。');return;}
 if(seg.id==='top'&&seg.t>.94){setPrompt('↓ 右侧出口方向','到达顶层最右端，按 ↓ 或 S 沿右侧管道下降。');return;}
 if(seg.id==='right-down'){setPrompt('↓ 即将抵达出口','继续向下，进入右下角的绿色排风口。');return;}
 setPrompt('沿管道继续潜入','方向键 / WASD 移动 · Space 跳断口 · E 开阀门');
}
function updateHUD(){
 const valves=Object.values(state.opened).filter(Boolean).length;
 $('valves').textContent=valves+'/ 2';$('steam-count').textContent=state.passed.size+'/ 3';$('fails').textContent=String(state.retries);
 $('clock').textContent=[Math.floor(state.elapsed/60),Math.floor(state.elapsed%60)].map(n=>String(n).padStart(2,'0')).join(':');
 const p=Math.round(100*state.s/TOTAL_LENGTH);$('percent').textContent=p+'% COMPLETE';$('overall-progress').style.width=p+'%';
 $('region').textContent=playerSegment().label;
 $('stage-badge').textContent=`${String(SEGMENTS.findIndex(x=>x.id===playerSegment().id)+1).padStart(2,'0')} / ${playerSegment().label}`;
}
function finishLevel(){
 if(!state.running)return;state.running=false;state.s=TOTAL_LENGTH;keys.clear();
 sound(880,.18);setTimeout(()=>sound(1110,.2),150);setTimeout(()=>sound(1370,.3),330);
 $('result').hidden=false;
 const cam=Object.values(state.valveModes).filter(m=>m==='camera').length;
 $('result-summary').textContent=`耗时 ${Math.floor(state.elapsed/60)}分${Math.floor(state.elapsed%60)}秒 · 重试 ${state.retries} 次 · 真实手势解锁 ${cam}/2 次`;
 window.dispatchEvent(new CustomEvent('lfg:pipe-room-complete',{detail:{timeSeconds:+state.elapsed.toFixed(1),retries:state.retries,valves:state.valveModes,steamCleared:state.passed.size}}));
}
function updateGame(dt,now){
 if(!state.running||state.modalValve)return;
 const dir=keyDirection(keys);
 const motion=movementForKey(state.s,dir);
 const velocity=motion.delta*PLAYER_SPEED*dt;
 if(motion.delta!==0){
  if(!state.started){state.started=true;state.startTime=now;}
  let target=motion.delta>0?Math.min(motion.limit,state.s+velocity):Math.max(motion.limit,state.s+velocity);
  const gate=clampAtLockedValve(state.s,target,state.opened);target=gate.s;
  if(gate.blocked){if(state.toastUntil<now)toast('🔒 阀门关闭！按 E 打开开闸面板。');}
  const prev=state.s;state.s=target;
  if(!(['up','down'].includes(motion.segment?.forward)))state.lastInput=dir;
  const hazard=hazardAt(state.s);
  if(hazard){const height=state.jump===null?0:jumpHeight(state.jump,JUMP_DURATION);if(height<=17){failSteam(hazard);return;}}
  for(const h of HAZARDS){if(prev<h.center+h.halfWidth+24 && state.s>=h.center+h.halfWidth+24)state.passed.add(h.id);}
  state.playerStatus=state.jump!==null?'jump':'move';
 }else state.playerStatus=state.jump!==null?'jump':'idle';
 if(state.jump!==null){state.jump+=dt;if(state.jump>=JUMP_DURATION)state.jump=null;}
 if(state.started)state.elapsed+=dt;
 if(state.s>=TOTAL_LENGTH-2 && Object.values(state.opened).every(Boolean))finishLevel();
 statusHint(now);updateHUD();
}
function roundRect(x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,r);}
function drawWorld(now){
 ctx.clearRect(0,0,WIDTH,HEIGHT);
 if(manifest)ctx.drawImage(worldLayer,0,0);else{ctx.fillStyle='#11344a';ctx.fillRect(0,0,WIDTH,HEIGHT);}
 const seconds=now/1000;
 for(const h of HAZARDS){
  const p=routeAt(h.center);drawSteam(p.x,p.y,seconds,h);
  if(!state.passed.has(h.id)){const launch=routeAt(h.center-131);ctx.save();ctx.fillStyle='#2b2632dd';ctx.strokeStyle='#f6c184';ctx.lineWidth=2;roundRect(launch.x-37,launch.y-88,74,29,6);ctx.fill();ctx.stroke();ctx.font='bold 15px monospace';ctx.textAlign='center';ctx.fillStyle='#ffe6b9';ctx.fillText('SPACE ↗',launch.x,launch.y-69);ctx.restore();}
 }
 for(const valve of VALVES){
  const x=valve.position[0]+(valve.id==='left'?0:0),y=valve.position[1];
  const unlocked=state.opened[valve.id];
  ctx.save();ctx.strokeStyle=unlocked?'#6cf1c3':'#ffbb75';ctx.globalAlpha=unlocked?.55:.65+.25*Math.sin(seconds*3.7);
  ctx.lineWidth=4;ctx.shadowColor=unlocked?'#6ef9cf':'#ed9247';ctx.shadowBlur=20;
  ctx.beginPath();ctx.ellipse(x,y,valve.id==='left'?69:61,64,0,0,Math.PI*2);ctx.stroke();ctx.restore();
  ctx.save();ctx.font='bold 16px system-ui';ctx.textAlign='center';ctx.fillStyle=unlocked?'#b3f4d8':'#ffd49a';
  ctx.fillText(unlocked?'✓ OPEN':'◈ LOCKED',x,y-82);ctx.restore();
 }
 drawPlayer(now);
 // Clear arrow & vent markers, in addition to their original art.
 drawPin(123,812,'START','#9dddc5',seconds);drawPin(1538,790,'EXIT','#a4fbb8',seconds);
 if(state.toastUntil>now){ctx.save();ctx.textAlign='center';ctx.font='bold 18px system-ui';roundRect(340,62,991,47,12);ctx.fillStyle='#102738e5';ctx.fill();ctx.fillStyle='#fff1ca';ctx.fillText(state.toast,835,92);ctx.restore();}
}
function drawPin(x,y,text,color,t){
 ctx.save();ctx.shadowBlur=16;ctx.shadowColor=color;ctx.strokeStyle=color;ctx.fillStyle='#102532bb';ctx.lineWidth=2;
 const by=y-58+Math.sin(t*3)*3;roundRect(x-36,by-17,72,26,6);ctx.fill();ctx.stroke();ctx.font='bold 12px monospace';ctx.textAlign='center';ctx.fillStyle=color;ctx.fillText(text,x,by+1);ctx.restore();
}
function drawSteam(x,y,t,h){
 ctx.save();ctx.globalCompositeOperation='screen';
 const n=1+.10*Math.sin(t*5+h.center*.01);
 const grd=ctx.createRadialGradient(x,y-5,7,x,y-18,68);
 grd.addColorStop(0,'#ffe4a8bd');grd.addColorStop(.35,'#fd9d58a0');grd.addColorStop(1,'#f0873700');
 ctx.fillStyle=grd;ctx.beginPath();ctx.ellipse(x,y-22,66,67,0,0,Math.PI*2);ctx.fill();
 for(let i=0;i<10;i++){
   const c=(i-4.5)*8.5,phase=((t*(55+(i%3)*14)+i*27)%116);
   const px=x+c+6*Math.sin(t*2.8+i),py=y-6-phase;
   ctx.fillStyle=i%3?'#ffe6c26e':'#fff5dfa0';ctx.beginPath();ctx.ellipse(px,py,(8+i%3*3)*n,(8+i%4*3)*n,Math.sin(t+i)*.26,0,Math.PI*2);ctx.fill();
 }
 ctx.strokeStyle='#ffab67dd';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(x-8,y+16);ctx.quadraticCurveTo(x-7,y-29,x-15,y-68);ctx.moveTo(x+9,y+14);ctx.quadraticCurveTo(x+14,y-28,x+6,y-74);ctx.stroke();
 ctx.restore();
}
function drawPlayer(now){
 const seg=playerSegment();const hopping=state.jump!==null;
 const height=hopping?jumpHeight(state.jump,JUMP_DURATION):0;
 const vertical=['ladder','left-rise','right-down'].includes(seg.id);
 const which=hopping?'jump':vertical?'up':seg.id==='middle'?'left':'right';
 const im=images.get('thief/'+which+'.png');if(!im)return;
 const x=seg.x,y=seg.y-height;
 ctx.save();ctx.imageSmoothingEnabled=false;
 // Tiny ground shadow shows the character's actual pipe centerline.
 ctx.fillStyle='#04121c92';ctx.beginPath();ctx.ellipse(x,seg.y+26,42,7,0,0,Math.PI*2);ctx.fill();
 if(vertical){const h=71,w=h*im.width/im.height;ctx.drawImage(im,x-w/2,y-h/2,w,h);}else if(hopping){const h=76,w=h*im.width/im.height;ctx.drawImage(im,x-w/2,y-h/2,w,h);}else{const w=111,h=w*im.height/im.width;const bob=state.playerStatus==='move'?Math.sin(now/80)*2:0;ctx.drawImage(im,x-w/2,y-h/2+bob,w,h);}
 ctx.restore();
}
function frame(now){
 const dt=state.lastTime?Math.min(.04,Math.max(0,(now-state.lastTime)/1000)):0;state.lastTime=now;
 updateGame(dt,now);drawWorld(now);
 if(state.modalValve){updateSimHold(now);updateCamera(now);}
 requestAnimationFrame(frame);
}
function updateSimHold(now){
 if(state.simHeld){
  const pct=clamp((now-state.keydownSimAt)/1200,0,1);$('demo-meter-fill').style.width=(pct*100)+'%';
  if(pct>=1){state.simHeld=false;finishValve('keyboard-simulation');}
 }else $('demo-meter-fill').style.width='0%';
}
async function startHandCamera(){
 if(!state.modalValve||state.handCameraActive)return;
 const attempt=++state.cameraAttempt;
 $('camera-start').disabled=true;$('gesture-status').textContent='正在载入 MediaPipe 模型并请求摄像头权限…';
 let newlyOpened;
 try{
  if(!navigator.mediaDevices?.getUserMedia)throw Error('请在 localhost 或 HTTPS 运行。');
  const [mp,stream]=await Promise.all([import(MP_ROOT),navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:'user',width:{ideal:640},height:{ideal:480}}})]);newlyOpened=stream;
  if(attempt!==state.cameraAttempt){stream.getTracks().forEach(t=>t.stop());return;}
  state.stream=stream;const video=$('valve-video');video.srcObject=stream;await video.play();
  if(!state.handModel){const vision=await mp.FilesetResolver.forVisionTasks(MP_ROOT+'/wasm');
    const opts={baseOptions:{modelAssetPath:HAND_MODEL,delegate:'GPU'},runningMode:'VIDEO',numHands:1,minHandDetectionConfidence:.52,minHandPresenceConfidence:.5,minTrackingConfidence:.5};
    try{state.handModel=await mp.HandLandmarker.createFromOptions(vision,opts);}catch{state.handModel=await mp.HandLandmarker.createFromOptions(vision,{...opts,baseOptions:{modelAssetPath:HAND_MODEL,delegate:'CPU'}});}
  }
  if(attempt!==state.cameraAttempt)return;
  state.handCameraActive=true;state.handSeq.reset();state.lastVideoTime=-1;state.lastHandAt=0;
  $('camera-empty').hidden=true;$('camera-start').disabled=true;$('camera-stop').disabled=false;
  $('gesture-tag').textContent='● REAL CAMERA TRACKING';$('gesture-status').textContent='请先握拳稳定约半秒，再保持握拳向任意一侧慢慢倾斜约 38°。';
 }catch(err){if(attempt===state.cameraAttempt){$('gesture-status').textContent='摄像头启动失败：'+err.message+'；仍可以用 Enter 测试关卡。';$('camera-start').disabled=false;}else newlyOpened?.getTracks().forEach(t=>t.stop());}
}
function drawHand(points){
 const cv=$('hand-overlay'),c=cv.getContext('2d');c.clearRect(0,0,cv.width,cv.height);
 if(!points)return;
 c.strokeStyle='#93ffde';c.lineWidth=3;c.beginPath();
 for(const [a,b] of CONNS){c.moveTo(points[a].x*cv.width,points[a].y*cv.height);c.lineTo(points[b].x*cv.width,points[b].y*cv.height);}c.stroke();
 points.forEach(p=>{c.fillStyle='#ffe2a3';c.beginPath();c.arc(p.x*cv.width,p.y*cv.height,4,0,Math.PI*2);c.fill();});
}
function updateCamera(now){
 if(!state.handCameraActive||!state.modalValve||!state.handModel)return;
 const video=$('valve-video');if(video.readyState<2||state.lastVideoTime===video.currentTime||now-state.lastHandAt<85)return;
 state.lastHandAt=now;state.lastVideoTime=video.currentTime;
 try{
  const res=state.handModel.detectForVideo(video,now);
  const pts=res.landmarks?.[0]||null;drawHand(pts);
  const seq=state.handSeq.update(pts,now);
  if(seq.phase==='grip'){
   $('gesture-step').textContent='01 / GRIP · 握住阀门';$('gesture-picture').textContent='✊';$('gesture-name').textContent='持续握拳';
   $('gesture-instruction').textContent='尽量让手完整入镜，手指全部收拢，持续约 0.55 秒。';
   $('gesture-meter').style.width=(seq.gripProgress*48)+'%';
   $('gesture-status').textContent=seq.fist?`正在抓紧阀门… ${Math.round(seq.gripProgress*100)}%`:'等待识别到握拳（至少三根手指弯曲）';
  }else{
   $('gesture-step').textContent='02 / TURN · 旋转阀门';$('gesture-picture').textContent='↻';$('gesture-name').textContent='保持握拳，缓慢侧倾';
   $('gesture-instruction').textContent='保持拳头朝向摄像头，在画面平面内向左或右倾斜约 38°。不是向镜头深处拧动。';
   $('gesture-meter').style.width=(48+seq.turnProgress*52)+'%';
   $('gesture-status').textContent=`检测旋转 ${seq.angle}° / 38° · 不要突然甩动手腕`;
  }
  if(seq.done)finishValve('camera');
 }catch(err){$('gesture-status').textContent='手部推理中断：'+err.message;console.error(err);}
}
$('camera-start').addEventListener('click',startHandCamera);
$('camera-stop').addEventListener('click',stopHandCamera);
$('close-modal').addEventListener('click',closeValve);
$('cancel-valve').addEventListener('click',closeValve);
$('restart').addEventListener('click',restart);
$('play-again').addEventListener('click',restart);
$('valve-modal').addEventListener('pointerdown',e=>{if(e.target===$('valve-modal'))closeValve();});
$('camera-stop').disabled=true;
preload();updateHUD();requestAnimationFrame(frame);

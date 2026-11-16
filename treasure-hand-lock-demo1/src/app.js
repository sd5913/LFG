import {analyzeHand, HAND_EDGES, GESTURES} from './hand-gestures.js';
import {UnlockMachine, STEPS, ROTATION_TARGET_RAD} from './unlock-machine.js';

// Match the MediaPipe Tasks Vision release currently used by the teammate pose-shadow prototype.
const TASKS_VERSION = '0.10.14';
const MP_MODULE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VERSION}`;
const WASM_ROOT = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VERSION}/wasm`;
const HAND_MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const $ = (id) => document.getElementById(id);
const video=$('webcam'), overlay=$('hand-overlay'), ctx=overlay.getContext('2d');
const state={mode:'simulation',held:new Set(),landmarker:null,stream:null,requestId:0,loading:false,session:0,
  lastInferenceAt:0,lastVideoTime:-1,hand:null,demoAngle:0,lastFrameAt:null,autoDemo:false,lastSeen:0,
  lastGesture:'NONE',thresholds:{pinch:.36},audioCtx:null};
const EVENT_NAME='lfg:treasure-unlocked';
const ICONS=['☝','🤏','✊','↻'];
const LABELS={POINT:'POINT ☝',PINCH:'PINCH 🤏',FIST:'FIST ✊',OPEN:'OPEN HAND ✋',UNKNOWN:'UNKNOWN',NONE:'NO HAND'};
const machine=new UnlockMachine(handleMachineEvent);

function notify(msg,kind='normal') { const node=$('camera-message');node.textContent=msg;node.classList.toggle('error',kind==='error'); }
function setMode(mode){state.mode=mode; $('input-tag').textContent=mode==='camera'?'● LIVE CAMERA':mode==='camera-loading'?'◌ CAMERA LOADING':'● SIMULATION MODE';
 $('input-tag').classList.toggle('camera',mode==='camera');$('camera-status').textContent=mode==='camera'?'LIVE':mode==='camera-loading'?'LOADING':'OFFLINE';
 $('camera-label').textContent=mode==='camera'?'LIVE LANDMARKS • 1 HAND':mode==='camera-loading'?'INITIALIZING MODEL':'SIMULATION • NO CAMERA';
 $('metric-mode').textContent=mode==='camera'?'REAL CAMERA':'SIMULATION';
 $('sim-warning').textContent=mode==='camera'?'CAMERA ACTIVE — TEST KEYS DISABLED':'SIMULATION ONLY';
 $('camera-empty').classList.toggle('hidden',mode==='camera'||mode==='camera-loading');
 $('stop-camera').classList.toggle('hidden',mode!=='camera'&&mode!=='camera-loading');
 $('start-camera').disabled=mode==='camera'||mode==='camera-loading';
 $('sim-mode').disabled=mode==='simulation';
}
function tone(freq=700, duration=.15, type='sine', vol=.05){
  try{state.audioCtx??=new (window.AudioContext||window.webkitAudioContext)();
    const a=state.audioCtx;if(a.state==='suspended')a.resume().catch(()=>{});
    const t=a.currentTime,o=a.createOscillator(),g=a.createGain();o.type=type;o.frequency.setValueAtTime(freq,t);g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(vol,t+.015);g.gain.exponentialRampToValueAtTime(.0001,t+duration);o.connect(g).connect(a.destination);o.start(t);o.stop(t+duration+.01);
  }catch{/* Some browsers do not support Web Audio; silent fallback. */}
}
function handleMachineEvent(event){
  if(event.type==='step-complete'){
    tone(event.step==='ROTATE'?1046:760,.18,'sine',.045);
    if(event.step==='ROTATE'){
      setTimeout(()=>tone(1318,.4,'triangle',.07),170);
      window.dispatchEvent(new CustomEvent(EVENT_NAME,{detail:{item:'ancient-relic',source:state.mode,unlocked:true}}));
      notify(state.mode==='camera'?'🎉 摄像头手势序列完成！宝箱已打开。':'🎉 已完成模拟流程！请用真实摄像头继续验证识别准确性。');
    }
  }
}

async function startCamera(){
  if(state.loading||state.mode==='camera')return;
  state.autoDemo=false;state.held.clear();stopCamera(false);
  const session=++state.session;
  state.loading=true;setMode('camera-loading');notify('正在请求摄像头并加载 MediaPipe Hand Landmarker…首次运行需要联网。');
  try{
    if(!navigator.mediaDevices?.getUserMedia)throw new Error('当前环境不支持摄像头。请使用 Chrome / Edge 打开 http://localhost:5173。');
    if(!window.isSecureContext)throw new Error('摄像头需要 HTTPS 或 localhost。');
    // Browser inference is local. No video frames are sent to the application server.
    const [mp,stream]=await Promise.all([
      import(MP_MODULE),
      navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:640},height:{ideal:480}},audio:false})
    ]);
    if(session!==state.session){stream.getTracks().forEach(x=>x.stop());return;}
    state.stream=stream;video.srcObject=stream;await video.play();
    if(session!==state.session)return;
    if(!state.landmarker){
      const vision=await mp.FilesetResolver.forVisionTasks(WASM_ROOT);
      const opts={baseOptions:{modelAssetPath:HAND_MODEL_URL,delegate:'GPU'},runningMode:'VIDEO',numHands:1,
        minHandDetectionConfidence:.5,minHandPresenceConfidence:.5,minTrackingConfidence:.5};
      try{state.landmarker=await mp.HandLandmarker.createFromOptions(vision,opts);}
      catch{state.landmarker=await mp.HandLandmarker.createFromOptions(vision,{...opts,baseOptions:{modelAssetPath:HAND_MODEL_URL,delegate:'CPU'}});}
    }
    if(session!==state.session)return;
    state.lastVideoTime=-1;state.lastInferenceAt=0;state.hand=null;state.lastGesture='NONE';state.demoAngle=0;
    state.loading=false;setMode('camera');notify('✅ 真实摄像头已启动。将单手完整放进画面，先伸出一根食指。识别来自真实摄像头。');
  } catch(e){
    if(session!==state.session)return;
    stopCamera(false);setMode('simulation');
    notify(`摄像头启动失败：${e?.message||String(e)}。可用模拟模式验证游戏逻辑。`,'error');
  } finally{ if(session===state.session)state.loading=false; }
}
function stopCamera(showMessage=true){
  ++state.session;state.loading=false;
  if(state.stream){state.stream.getTracks().forEach(t=>t.stop());state.stream=null;}
  video.pause();video.srcObject=null;ctx.clearRect(0,0,overlay.width,overlay.height);
  state.hand=null;state.lastSeen=0;state.lastGesture='NONE';
  setMode('simulation');
  if(showMessage)notify('已关闭真实摄像头。当前为模拟模式，摄像头画面不会录制或上传。');
}
function drawLandmarks(points,expected){
  ctx.clearRect(0,0,overlay.width,overlay.height);
  if(!points)return;
  const w=overlay.width,h=overlay.height;
  ctx.lineWidth=3.8;ctx.strokeStyle=expected?'#e8c185':'#72d2ce';ctx.lineCap='round';ctx.lineJoin='round';
  ctx.beginPath();for(const [i,j] of HAND_EDGES){ctx.moveTo(points[i].x*w,points[i].y*h);ctx.lineTo(points[j].x*w,points[j].y*h);}ctx.stroke();
  for(let i=0;i<21;i++){
    const p=points[i];ctx.beginPath();ctx.arc(p.x*w,p.y*h,[4,8,12,16,20].includes(i)?6:3.6,0,Math.PI*2);
    ctx.fillStyle=[4,8].includes(i)?'#f5ca81':'#eaf9f5';ctx.fill();
  }
  ctx.fillStyle='rgba(14,24,29,.66)';ctx.fillRect(0,0,w,32);
  ctx.fillStyle='#d9ede8';ctx.font='bold 17px monospace';ctx.fillText('HAND LANDMARKS / 21 POINTS',15,22);
}
function maybeInfer(now){
  if(state.mode!=='camera'||!state.landmarker||!state.stream||video.readyState<2)return;
  if(now-state.lastInferenceAt<55 || video.currentTime===state.lastVideoTime)return;
  state.lastInferenceAt=now;state.lastVideoTime=video.currentTime;
  try{
    const result=state.landmarker.detectForVideo(video,now);
    const points=result.landmarks?.[0]||null;
    state.hand=points?analyzeHand(points,state.thresholds):{gesture:GESTURES.NONE,valid:false,angle:null,metrics:null};
    state.lastGesture=state.hand.gesture;
    state.lastSeen=now;
    const expected=machine.stepIndex===3?'FIST':machine.step?.id;
    drawLandmarks(points,state.hand.gesture===expected);
  } catch(e){
    stopCamera(false);notify(`识别发生错误：${e?.message||e}`,'error');
  }
}
function simulateInput(dt,now){
  if(state.autoDemo){
    // Automated inputs are intentionally marked SIMULATION. They are NOT ML predictions.
    if(machine.unlocked){state.autoDemo=false;return {gesture:'NONE',angle:null,valid:false,metrics:null};}
    const id=machine.stepIndex===3?'FIST':machine.step.id;
    if(machine.stepIndex===3)state.demoAngle+=.00165*dt;
    return {gesture:id,angle:state.demoAngle,valid:true,metrics:null};
  }
  const held=state.held;let gesture=GESTURES.NONE;
  if(held.has('3'))gesture=GESTURES.FIST;
  else if(held.has('2'))gesture=GESTURES.PINCH;
  else if(held.has('1'))gesture=GESTURES.POINT;
  if(gesture===GESTURES.FIST){
    if(held.has('LEFT'))state.demoAngle-=.0021*dt;
    if(held.has('RIGHT'))state.demoAngle+=.0021*dt;
  } else {state.demoAngle=0;}
  return {gesture,angle:gesture===GESTURES.FIST?state.demoAngle:null,valid:gesture!==GESTURES.NONE,metrics:null};
}
function renderUI(analysis,snapshot){
  const actual=analysis.gesture||'NONE';
  $('gesture-name').textContent=LABELS[actual]??actual;
  const good=!snapshot.unlocked&&(snapshot.step==='ROTATE'?actual==='FIST':actual===snapshot.step);
  $('match-state').textContent=snapshot.unlocked?'SUCCESS':good?'MATCHING':'Not matched';
  $('match-state').classList.toggle('good',good||snapshot.unlocked);
  const scene=$('museum-scene');scene.classList.toggle('opened',snapshot.unlocked);
  for(let i=1;i<=2;i++)scene.classList.toggle(`stage-${i}`,!snapshot.unlocked&&snapshot.stepIndex===i);
  scene.classList.toggle('stage-3',!snapshot.unlocked&&snapshot.stepIndex===3);
  const index=Math.min(snapshot.stepIndex,3);
  const step=STEPS[index];
  $('instruction-icon').textContent=snapshot.unlocked?'✦':ICONS[index];
  $('instruction-title').textContent=snapshot.unlocked?'UNLOCKED · 宝箱已开启':step.title;
  $('instruction-copy').textContent=snapshot.unlocked?'成功取得宝物，点击 Reset 可重新挑战':step.instruction;
  $('stage-readout').textContent=snapshot.unlocked?'TREASURE ACQUIRED':`STAGE ${String(index+1).padStart(2,'0')} / 04`;
  $('vault-status').textContent=snapshot.unlocked?'UNLOCKED':`LOCKED · ${index+1}/4`;
  const total=(snapshot.unlocked?4:(index+snapshot.progress))/4;
  $('track-fill').style.width=`${(total*100).toFixed(1)}%`;
  $('progress-text').textContent=`${Math.round(total*100)}%`;
  $('angle-label').textContent=index===3?'ROLL ANGLE':'HOLD';
  $('angle-value').textContent=index===3?`${snapshot.rotationDegrees}° / 50°`:`${Math.round(snapshot.progress*100)}%`;
  const rotateDeg=Math.min(90,snapshot.rotationDegrees);
  $('turning-lock').style.transform=`rotate(${(snapshot.unlocked?95:rotateDeg)}deg)`;
  [...document.querySelectorAll('[data-step]')].forEach(el=>{
    const i=Number(el.dataset.step);el.classList.toggle('active',!snapshot.unlocked&&i===index);
    el.classList.toggle('done',snapshot.unlocked||i<index);
    el.querySelector('.step-meter>div').style.width=`${snapshot.unlocked||i<index?100:i===index?snapshot.progress*100:0}%`;
  });
  const detected=actual==='FIST'&&index===3?'ROTATE':actual;
  document.querySelectorAll('[data-gesture-card]').forEach(el=>el.classList.toggle('active',detected===el.dataset.gestureCard));
  $('metric-presence').textContent=analysis.valid?'YES':'NO';
  $('metric-pinch').textContent=analysis.metrics?analysis.metrics.pinchDistance.toFixed(2):'—';
  $('metric-angle').textContent=analysis.angle!=null?`${Math.round(analysis.angle*180/Math.PI)}°`:'—';
}
function frame(now){
  const dt=state.lastFrameAt===null?0:Math.max(0,Math.min(70,now-state.lastFrameAt));state.lastFrameAt=now;
  if(state.mode==='camera')maybeInfer(now);
  let analysis;
  if(document.hidden)analysis={gesture:'NONE',angle:null,valid:false,metrics:null};
  else if(state.mode==='camera')analysis=now-state.lastSeen<250 && state.hand?state.hand:{gesture:'NONE',angle:null,valid:false,metrics:null};
  else if(state.mode==='camera-loading')analysis={gesture:'NONE',angle:null,valid:false,metrics:null};
  else analysis=simulateInput(dt,now);
  const snapshot=machine.update({gesture:analysis.gesture,angle:analysis.angle,now});
  renderUI(analysis,snapshot);
  state.requestId=requestAnimationFrame(frame);
}

$('start-camera').addEventListener('click',startCamera);
$('stop-camera').addEventListener('click',()=>stopCamera());
$('sim-mode').addEventListener('click',()=>{stopCamera();state.autoDemo=false;state.held.clear();});
$('reset-btn').addEventListener('click',()=>{state.autoDemo=false;state.demoAngle=0;state.held.clear();machine.reset();notify(state.mode==='camera'?'已重置宝箱。请重新伸出食指。':'宝箱已重置。使用模拟按键，或开启真实摄像头。');});
$('sensitivity').addEventListener('input',(e)=>{state.thresholds.pinch=Number(e.target.value);$('threshold-value').textContent=state.thresholds.pinch.toFixed(2);});
$('auto-demo').addEventListener('click',()=>{if(state.mode==='camera'||state.mode==='camera-loading')stopCamera(false);state.held.clear();machine.reset();state.demoAngle=0;state.autoDemo=true;notify('▶ 正在自动播放模拟手势流程（不是摄像头识别）。完成后请实际测试真实手势。');});
const keyMap={'1':'1','2':'2','3':'3','ArrowLeft':'LEFT','ArrowRight':'RIGHT'};
window.addEventListener('keydown',(e)=>{
  if(e.target?.tagName==='INPUT')return;
  const k=keyMap[e.key];if(!k)return;
  if(state.mode==='camera')return;
  e.preventDefault();state.autoDemo=false;state.held.add(k);
  const b=document.querySelector(`[data-key="${k}"]`);b?.classList.add('pressed');
});
window.addEventListener('keyup',(e)=>{
  const k=keyMap[e.key];if(!k)return;
  state.held.delete(k);document.querySelector(`[data-key="${k}"]`)?.classList.remove('pressed');
});
window.addEventListener('blur',()=>{state.held.clear();document.querySelectorAll('.test-key.pressed').forEach(el=>el.classList.remove('pressed'));});
for(const button of document.querySelectorAll('.test-key')){
  const k=button.dataset.key;
  const down=(e)=>{if(state.mode==='camera')return;e.preventDefault();state.autoDemo=false;state.held.add(k);button.classList.add('pressed');try{button.setPointerCapture(e.pointerId);}catch{}};
  const up=()=>{state.held.delete(k);button.classList.remove('pressed');};
  button.addEventListener('pointerdown',down);button.addEventListener('pointerup',up);button.addEventListener('pointercancel',up);button.addEventListener('lostpointercapture',up);
}
window.addEventListener('beforeunload',()=>{state.stream?.getTracks().forEach(t=>t.stop());cancelAnimationFrame(state.requestId);state.landmarker?.close?.();});
setMode('simulation');requestAnimationFrame(frame);

import {STAGES,HAND_CONNECTIONS,describeHand,evaluateStage} from './seal-recognizer.js';
import {RitualMachine} from './ritual-machine.js';

// Keep the same pinned MediaPipe version as the working LFG Treasure Unlock v0.2.
const VERSION='0.10.14';
const MP_ROOT=`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}`;
const WASM_ROOT=`${MP_ROOT}/wasm`;
const HAND_MODEL='https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const POSE_MODEL='https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
const $=id=>document.getElementById(id);
const video=$('webcam'),overlay=$('overlay'),ctx=overlay.getContext('2d');
const state={mode:'simulation',stream:null,handModel:null,poseModel:null,session:0,loading:false,lastFrameAt:0,lastResultAt:0,lastPoseAt:0,lastVideoTime:-1,handResult:[],poseResult:null,heldSim:false,autoTimer:null,lastEval:null,lastEvalStage:null,raf:null,audio:null};
const machine=new RitualMachine(onRitualEvent);
const HAND_EDGES=HAND_CONNECTIONS;
const POSE_EDGES=[[11,13],[13,15],[12,14],[14,16],[11,12]];
function msg(text,type='normal'){const n=$('message');n.textContent=text;n.classList.toggle('error',type==='error');}
function beep(f=540,ms=140){try{state.audio??=new (window.AudioContext||window.webkitAudioContext)();const a=state.audio;if(a.state==='suspended')a.resume().catch(()=>{});const o=a.createOscillator(),g=a.createGain();o.type='sine';o.frequency.setValueAtTime(f,a.currentTime);g.gain.setValueAtTime(.0001,a.currentTime);g.gain.exponentialRampToValueAtTime(.075,a.currentTime+.016);g.gain.exponentialRampToValueAtTime(.0001,a.currentTime+ms/1000);o.connect(g);g.connect(a.destination);o.start();o.stop(a.currentTime+ms/1000+.01);}catch{/* sound optional */}}
function onRitualEvent(e){
 if(e.type==='step-complete'){
  beep(450+e.index*160,180);
  const stage=STAGES[e.index-1];msg(`✓ ${stage.name} · 结印成功！${e.index<4?'下一式已经解锁。':'四重封印解除。'}`);
  if(e.index<4){$('relic-panel').classList.add('flash');setTimeout(()=>$('relic-panel').classList.remove('flash'),650);}
 }
 if(e.type==='unlocked'){
  beep(990,450);setTimeout(()=>beep(1320,420),200);
  window.dispatchEvent(new CustomEvent('lfg:anime-seal-unlocked',{detail:{source:state.mode==='camera'?'camera':'simulation',steps:e.steps,unlocked:true}}));
  msg(state.mode==='camera'?'🎉 四重真实结印完成！封印已解除。':'🎉 模拟开锁成功！注意：这不代表真实摄像头已经识别成功。');
 }
}
function setMode(mode){
 state.mode=mode;
 const live=mode==='camera',loading=mode==='loading';
 $('mode-badge').textContent=live?'● REAL CAMERA / LIVE':loading?'◌ INITIALIZING MODELS':'○ OFFLINE / SIMULATION';
 $('mode-badge').classList.toggle('live',live);
 $('camera-tag').textContent=live?'● LIVE HAND + POSE':loading?'LOADING…':'NO CAMERA';
 $('video-label').textContent=live?'● LIVE SENSOR / MIRRORED VIEW':loading?'◌ MODEL LOADING':'● SIMULATION / NOT ML';
 $('video-wrap').classList.toggle('live',live);
 $('start-camera').disabled=live||loading;
 $('stop-camera').disabled=!live&&!loading;
 $('sim-hold').disabled=live||loading||machine.unlocked;
 $('auto-demo').disabled=live||loading||machine.unlocked;
}
function reset(){machine.reset();state.lastEval=null;state.lastEvalStage=null;state.heldSim=false;$('sim-hold').textContent='按住模拟当前结印';stopAuto();msg(state.mode==='camera'?'已重置。请从 Kon 狐印开始。':'Ready. 可以启动摄像头，或者按住模拟按钮测试四步流程。');render(performance.now());}
function stopAuto(){if(state.autoTimer){clearInterval(state.autoTimer);state.autoTimer=null;}state.heldSim=false;}
function stopCamera(announce=true){++state.session;state.loading=false;if(state.stream){state.stream.getTracks().forEach(t=>t.stop());state.stream=null;}video.pause();video.srcObject=null;state.handResult=[];state.poseResult=null;ctx.clearRect(0,0,overlay.width,overlay.height);setMode('simulation');if(announce)msg('已关闭摄像头。现在是模拟模式，快捷按钮不是手势识别结果。');}

async function createModel(mp,vision,type,url){
 const factory=type==='hand'?mp.HandLandmarker:mp.PoseLandmarker;
 const opts={baseOptions:{modelAssetPath:url,delegate:'GPU'},runningMode:'VIDEO',...(type==='hand'?{numHands:2,minHandDetectionConfidence:.55,minHandPresenceConfidence:.5,minTrackingConfidence:.5}:{numPoses:1,minPoseDetectionConfidence:.5,minPosePresenceConfidence:.5,minTrackingConfidence:.5})};
 try{return await factory.createFromOptions(vision,opts);}catch(err){return factory.createFromOptions(vision,{...opts,baseOptions:{modelAssetPath:url,delegate:'CPU'}});}
}
async function startCamera(){
 if(state.loading||state.mode==='camera')return;
 stopAuto();stopCamera(false);reset();
 const session=++state.session;state.loading=true;setMode('loading');
 msg('正在加载 Hand Landmarker 与 Pose Landmarker，并申请摄像头权限；首次运行需要联网。');
 let newlyOpened=null;
 try{
  if(!navigator.mediaDevices?.getUserMedia)throw new Error('摄像头不可用，请从 localhost 或 HTTPS 打开。');
  const [mp,stream]=await Promise.all([import(MP_ROOT),navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:'user',width:{ideal:640},height:{ideal:480}}})]);
  newlyOpened=stream;
  if(session!==state.session){stream.getTracks().forEach(t=>t.stop());return;}
  state.stream=stream;video.srcObject=stream;await video.play();
  if(session!==state.session)return;
  const vision=await mp.FilesetResolver.forVisionTasks(WASM_ROOT);
  if(session!==state.session)return;
  // Pose is loaded once but inference runs only for the final X-arm stage.
  if(!state.handModel)state.handModel=await createModel(mp,vision,'hand',HAND_MODEL);
  if(session!==state.session)return;
  msg('手部模型已载入；正在准备双臂姿态模型…');
  if(!state.poseModel)state.poseModel=await createModel(mp,vision,'pose',POSE_MODEL);
  if(session!==state.session)return;
  state.lastFrameAt=0;state.lastVideoTime=-1;state.lastPoseAt=0;state.handResult=[];state.poseResult=null;
  state.loading=false;setMode('camera');msg('✅ 双模型已就绪。请把手放进镜头，先做 Kon 狐印；最后一关要露出整个上半身。');
 }catch(err){
  if(session===state.session){stopCamera(false);msg('摄像头/模型启动失败：'+(err?.message||String(err))+'。请检查权限、网络并使用 Chrome/Edge。','error');}
  else newlyOpened?.getTracks().forEach(t=>t.stop());
 }finally{if(session===state.session)state.loading=false;}
}
function drawConnections(points,edges,color){
 const w=overlay.width,h=overlay.height;
 ctx.lineWidth=3;ctx.lineJoin='round';ctx.lineCap='round';ctx.strokeStyle=color;ctx.beginPath();
 for(const [a,b] of edges){if(!points[a]||!points[b])continue;ctx.moveTo(points[a].x*w,points[a].y*h);ctx.lineTo(points[b].x*w,points[b].y*h);}ctx.stroke();
 for(const [i,p] of points.entries()){
  if(!p)continue;if(p.visibility!==undefined && p.visibility<.38)continue;
  ctx.fillStyle=i%4===0?'#e6b97a':'#bcf9e1';ctx.beginPath();ctx.arc(p.x*w,p.y*h,i%4===0?4.6:3.2,0,Math.PI*2);ctx.fill();
 }
}
function drawOverlay(){ctx.clearRect(0,0,overlay.width,overlay.height);
 if(state.mode!=='camera')return;
 if(machine.stage.needPose && state.poseResult){drawConnections(state.poseResult,POSE_EDGES,'#efbf74');}
 for(const h of state.handResult){drawConnections(h.pts,HAND_EDGES,'#88efd5');}
 ctx.font='bold 14px monospace';ctx.fillStyle='#eaf9f0';ctx.fillText(`HANDS ${state.handResult.length} / 2`,14,38);
}
function infer(now){
 if(state.mode!=='camera'||!state.handModel||!state.stream||video.readyState<2)return;
 if(now-state.lastFrameAt<100||video.currentTime===state.lastVideoTime)return;
 state.lastFrameAt=now;state.lastVideoTime=video.currentTime;
 try{
  const res=state.handModel.detectForVideo(video,now);
  state.handResult=(res.landmarks||[]).map((points,i)=>describeHand(points,res.worldLandmarks?.[i])).filter(Boolean);
  state.lastResultAt=now;
  if(machine.stage.needPose && state.poseModel && now-state.lastPoseAt>=155){
   const pr=state.poseModel.detectForVideo(video,now);
   state.poseResult=pr.landmarks?.[0]||null;state.lastPoseAt=now;
  }
  drawOverlay();
 }catch(err){msg('推理出错：'+(err?.message||String(err)),'error');stopCamera(false);}
}
function evaluate(now){
 if(state.mode==='camera'){
  if(now-state.lastResultAt>360)return {score:0,accepted:false,checks:[{label:'摄像头帧过期，请露出手部',ok:false}]};
  return evaluateStage(machine.stage.id,state.handResult,machine.stage.needPose?state.poseResult:null);
 }
 if(state.mode==='loading')return {score:0,accepted:false,checks:[{label:'正在加载模型',ok:false}]};
 const simMatch=state.heldSim || Boolean(state.autoTimer);
 return {score:simMatch?1:0,accepted:simMatch,checks:[{label:simMatch?'SIMULATED INPUT / 非真实识别':'按住右下方模拟按钮（非真实摄像头）',ok:simMatch}]};
}
function render(now){
 const st=machine.snapshot(),completed=st.unlocked?4:st.index;
 $('relic-panel').classList.toggle('unlocked',st.unlocked);
 $('vault-state').textContent=st.unlocked?'✦ UNLOCKED':'◈ SEAL ACTIVE';
 $('scene-count').textContent=`${completed} / 4 SEALS BROKEN`;
 document.querySelectorAll('[data-pip]').forEach(n=>n.classList.toggle('done',Number(n.dataset.pip)<completed));
 document.querySelectorAll('[data-step]').forEach(node=>{
  const i=Number(node.dataset.step);node.classList.toggle('active',!st.unlocked&&i===st.index);node.classList.toggle('done',i<completed);
  node.querySelector('.step-mark').textContent=i<completed?'✓':(!st.unlocked&&i===st.index?'◆':'◌');
  node.querySelector('.mini-track>i').style.width=(i<completed?100:(!st.unlocked&&i===st.index?st.progress*100:0))+'%';
 });
 const stage=STAGES[Math.min(st.index,3)];
 $('current-title').textContent=st.unlocked?'✦ 封印已解除':String(st.index+1).padStart(2,'0')+' · '+stage.name;
 $('stage-number').textContent=st.unlocked?'MISSION COMPLETE':`STEP ${st.index+1} / 4`;
 $('stage-quote').textContent=st.unlocked?'「禁術发动成功。博物馆保安：？？？」':'「'+stage.subtitle+'」';
 $('instruction').textContent=st.unlocked?'你已完成四重结印。点击重置可再次测试，或将成功事件接入你们的 LFG 宝箱。':stage.instruction;
 $('hold-bar').style.width=Math.round(st.progress*100)+'%';$('hold-percent').textContent=Math.round(st.progress*100)+'%';
 $('match-label').textContent=st.unlocked?'SEALS BROKEN':(state.lastEval?.accepted?'✓ SEAL MATCH / HOLD STEADY':'AWAITING CORRECT SEAL');
 $('hand-count').textContent=state.mode==='camera'?String(state.handResult.length):'SIM';
 $('pose-state').textContent=stage.needPose?(state.mode==='camera'?(state.poseResult?'FOUND':'MISSING'):'SIM'):'NOT NEEDED';
 $('rule-score').textContent=state.lastEval?Math.round(state.lastEval.score*100)+'%':'0%';
 $('rule-outcome').textContent=st.unlocked?'UNLOCKED':state.lastEval?.accepted?'MATCH':'NOT YET';
 const checks=state.lastEval?.checks||[];
 $('checks').replaceChildren(...checks.map(c=>{const n=document.createElement('div');n.className='check '+(c.ok?'pass':'fail');const icon=document.createElement('i');icon.textContent=c.ok?'✓':'×';const t=document.createElement('span');t.textContent=c.label;n.append(icon,t);return n;}));
 $('help-line').textContent=st.unlocked?'结束。主游戏接入事件：lfg:anime-seal-unlocked':state.mode==='camera'?stage.fallback:'模拟按钮只测试关卡流程。真实模式下必须本人完成结印。';
 $('sim-hold').disabled=state.mode!=='simulation'||st.unlocked;
 $('auto-demo').disabled=state.mode!=='simulation'||st.unlocked;
}
function frame(now){
 if(!document.hidden)infer(now);
 const res=document.hidden?{accepted:false,score:0,checks:[{label:'切换回网页继续检测',ok:false}]}:evaluate(now);
 state.lastEval=res;
 machine.update({matched:res.accepted&&!document.hidden,now});
 render(now);state.raf=requestAnimationFrame(frame);
}
$('start-camera').addEventListener('click',startCamera);
$('stop-camera').addEventListener('click',()=>stopCamera(true));
$('simulation').addEventListener('click',()=>{stopAuto();stopCamera(true);reset();});
$('reset').addEventListener('click',reset);
function hold(on){if(state.mode!=='simulation')return;stopAuto();state.heldSim=on;}
const sim=$('sim-hold');sim.addEventListener('pointerdown',e=>{e.preventDefault();sim.setPointerCapture(e.pointerId);hold(true);});
for(const name of ['pointerup','pointercancel','lostpointercapture'])sim.addEventListener(name,()=>{state.heldSim=false;});
sim.addEventListener('keydown',e=>{if(e.code==='Space'||e.code==='Enter'){e.preventDefault();hold(true);}});
sim.addEventListener('keyup',()=>{state.heldSim=false;});
$('auto-demo').addEventListener('click',()=>{
 if(state.mode!=='simulation')return;reset();msg('⚠ 自动展示模式：这是模拟信号，不代表摄像头识别成功。');
 // Interval merely keeps the active simulator flag set; progression is still
 // governed by the same hold timer and evaluated on the animation loop.
 state.autoTimer=setInterval(()=>{if(machine.unlocked)stopAuto();},100);
});
window.addEventListener('beforeunload',()=>{stopAuto();stopCamera(false);cancelAnimationFrame(state.raf);});
setMode('simulation');render(performance.now());state.raf=requestAnimationFrame(frame);

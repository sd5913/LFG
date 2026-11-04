import { SETTINGS, playerInCone, nearestExhibit, ScanController } from './guard-logic.js';
import { WebcamPoseTracker } from './pose-tracker.js';
import { CAMERA_CONFIG, sweepAngle, angleToPlayer } from './camera-rig.js';

const el = id => document.getElementById(id);
const canvas = el('scene');
const ctx = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;
const GROUND = 460;
const exhibits = [
  { id:'marble', x:388, name:'MARBLE FIGURE', pose:'T_POSE' },
  { id:'victory', x:773, name:'WINGED VICTORY', pose:'ARMS_UP' },
];
const scan = new ScanController();
const tracker = new WebcamPoseTracker(el('webcam'));
const keys = new Set();
const input = { selectedPose:'NONE', externalMatch:null, cameraEnabled:false, result:{matched:false,recognized:false} };
let player = {x:388, y:GROUND, width:27, height:70};
let running = false, paused = false, gameTime = 0, lastTime = 0;
let focusUntil = 0, lastPose = null, lastStatus = '', soundContext = null;
let alarmVisualTime = 0, caughtOverlayShown = false, successfulDisguises = 0, won = false;
let light = {x:CAMERA_CONFIG.pivotX,y:CAMERA_CONFIG.pivotY,angle:Math.PI/2};
let cameraTracking = false;
let scanCooldownUntil = 0;
let cameraMode = 'SWEEPING';
let state = scan.snapshot(null);

const clamp = (n,a,b)=>Math.max(a,Math.min(b,n));
const fmtTime = seconds=>`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(Math.floor(seconds%60)).padStart(2,'0')}`;
const nearest = ()=>nearestExhibit(player.x, exhibits);
const closeToStatue = ()=>Math.abs(player.x-nearest().x) < SETTINGS.statueRadius;

function reset() {
  scan.reset();
  state = scan.snapshot(null);
  player.x = 388;
  gameTime = 0;
  running = false;
  paused = false;
  focusUntil = 0;
  cameraTracking = false;
  scanCooldownUntil = 0;
  cameraMode = 'SWEEPING';
  light = {x:CAMERA_CONFIG.pivotX,y:CAMERA_CONFIG.pivotY,angle:Math.PI/2};
  alarmVisualTime = 0;
  caughtOverlayShown = false;
  successfulDisguises = 0;
  won = false;
  input.selectedPose = 'NONE';
  input.externalMatch = null;
  keys.clear();
  showOverlay('MISSION: BEAT THE CCTV','Move near a statue. When the camera catches you in its beam, copy the statue pose before the red alarm starts.','ACTIVATE CCTV');
  el('scene').parentElement.classList.remove('alarm-flash');
  renderStatus();
}

function start() {
  if (scan.state === 'ALARM' || won) {
    reset();
  }
  running = true;
  paused = false;
  hideOverlay();
  ensureAudio();
  renderStatus();
}

function showOverlay(title, description, buttonLabel) {
  el('stageOverlay').classList.remove('hidden');
  const box = el('stageOverlay');
  box.querySelector('h2').textContent = title;
  box.querySelector('p').textContent = description;
  el('startOverlay').innerHTML = buttonLabel + ' <span>↗</span>';
}
function hideOverlay() { el('stageOverlay').classList.add('hidden'); }
function setPause() {
  if (!running || scan.state==='ALARM' || won) return;
  paused = !paused;
  el('pauseBtn').textContent = paused ? '▶ Resume' : 'Ⅱ Pause';
  if (paused) showOverlay('CCTV PAUSED','Continue when you are ready to test the next scan.','RESUME CCTV');
  else hideOverlay();
}
function focusBeam() {
  if (!running) start();
  focusUntil = gameTime + 4.4;
  cameraTracking = true;
  cameraMode = 'FORCED SCAN';
}
function ensureAudio() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    if (!soundContext) soundContext = new AudioCtx();
    if (soundContext.state === 'suspended') soundContext.resume();
  } catch (_) { /* audio is non-critical in this demo */ }
}
function beepAlarm() {
  ensureAudio();
  if (!soundContext) return;
  const now=soundContext.currentTime;
  for(let j=0;j<6;j++) {
    const o=soundContext.createOscillator();
    const gain=soundContext.createGain();
    o.type='square';
    o.frequency.setValueAtTime(j%2===0 ? 740 : 520,now+j*.23);
    gain.gain.setValueAtTime(.0001,now+j*.23);
    gain.gain.exponentialRampToValueAtTime(.075,now+j*.23+.035);
    gain.gain.exponentialRampToValueAtTime(.0001,now+j*.23+.2);
    o.connect(gain); gain.connect(soundContext.destination);
    o.start(now+j*.23); o.stop(now+j*.23+.21);
  }
}
function scanMotion() {
  // Unlike the guard variant, the CCTV is mounted to one ceiling pivot.
  light.x = CAMERA_CONFIG.pivotX;
  light.y = CAMERA_CONFIG.pivotY;
  const sweeping = sweepAngle(gameTime, CAMERA_CONFIG);
  const forced = gameTime < focusUntil;
  // Automatic tracking only starts when the *sweeping* cone first detects a player.
  // We never lock through walls or when the player is outside the sweep.
  if (!cameraTracking && !forced && gameTime >= scanCooldownUntil && scan.state === 'SAFE') {
    const firstContact = playerInCone(player, light, sweeping, CAMERA_CONFIG.beamRange, CAMERA_CONFIG.beamHalfAngle);
    if (firstContact) cameraTracking = true;
  }
  if (forced || cameraTracking) {
    light.angle = angleToPlayer(light, player);
    cameraMode = forced ? 'FORCED SCAN' : 'TRACKING';
  } else {
    light.angle = sweeping;
    cameraMode = 'SWEEPING';
  }
}

function currentPoseMatch(timestamp) {
  const exhibit=nearest();
  if (input.externalMatch !== null) return !!input.externalMatch;
  if (input.cameraEnabled && tracker.active) {
    input.result=tracker.update(exhibit.pose,timestamp);
    return input.result.matched;
  }
  input.result={recognized:input.selectedPose!=='NONE',matched:input.selectedPose===exhibit.pose};
  return input.result.matched;
}
function simulation(deltaMs, timestamp) {
  if (!running || paused || scan.state==='ALARM' || won) return;
  const dt=Math.min(50,Math.max(0,deltaMs));
  gameTime += dt/1000;
  const step = dt/1000*169;
  if (keys.has('a')||keys.has('arrowleft')) player.x-=step;
  if (keys.has('d')||keys.has('arrowright')) player.x+=step;
  player.x=clamp(player.x,40,W-38);
  scanMotion();
  const illuminated=playerInCone(player, {x:light.x,y:light.y}, light.angle, CAMERA_CONFIG.beamRange, CAMERA_CONFIG.beamHalfAngle);
  const poseMatched=currentPoseMatch(timestamp);
  const wasState=scan.state;
  state=scan.update(dt,{illuminated,nearExhibit:closeToStatue(),poseMatched});
  if(state.event==='alarm') { alarmVisualTime=0; caughtOverlayShown=false; beepAlarm(); }
  if(state.event==='disguised') {
    successfulDisguises++;
    // Recognition succeeded: stop following the statue and resume ordinary patrol.
    cameraTracking = false;
    focusUntil = 0;
    scanCooldownUntil = gameTime + CAMERA_CONFIG.releaseCooldownSeconds;
  }
  if (player.x>916 && successfulDisguises>0) {
    won=true; running=false;
    showOverlay('ARTIFACT RECOVERED!','You successfully used a statue pose to fool the CCTV camera. The final game will add more challenges.','PLAY AGAIN');
  }
}
function drawBackdrop() {
  const bg=ctx.createLinearGradient(0,0,0,H);
  bg.addColorStop(0,'#17253c'); bg.addColorStop(.72,'#1c2940'); bg.addColorStop(1,'#10182a');
  ctx.fillStyle=bg; ctx.fillRect(0,0,W,H);
  // Tall museum wall panels.
  for(let i=0;i<8;i++) {
    const x=i*133-26;
    ctx.fillStyle=i%2?'#1c2d46':'#1b2a40'; ctx.fillRect(x,0,116,385);
    ctx.strokeStyle='#37445c'; ctx.lineWidth=2;ctx.strokeRect(x+5,10,105,366);
    ctx.strokeStyle='#2f3e55'; ctx.lineWidth=1;ctx.strokeRect(x+12,17,91,350);
  }
  ctx.fillStyle='#304159'; ctx.fillRect(0,67,W,7);
  ctx.fillStyle='#55637c';ctx.fillRect(0,81,W,2);
  ctx.fillStyle='#263249';ctx.fillRect(0,382,W,30);
  ctx.fillStyle='#45546d';ctx.fillRect(0,385,W,4);
  // Framed paintings.
  const paintings=[{x:70,y:131,w:120,h:150},{x:528,y:105,w:133,h:175},{x:846,y:142,w:89,h:134}];
  paintings.forEach((p,i)=>{
    ctx.fillStyle='#a78555';ctx.fillRect(p.x-6,p.y-6,p.w+12,p.h+12);
    ctx.fillStyle='#40362d';ctx.fillRect(p.x,p.y,p.w,p.h);
    const c=ctx.createLinearGradient(p.x,p.y,p.x+p.w,p.y+p.h);
    c.addColorStop(0,i%2===0?'#4a657c':'#63717a');c.addColorStop(1,'#222e40');
    ctx.fillStyle=c;ctx.fillRect(p.x+7,p.y+7,p.w-14,p.h-14);
    ctx.fillStyle='#b0a08966';ctx.beginPath();ctx.arc(p.x+p.w*.52,p.y+p.h*.35,19,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.moveTo(p.x+16,p.y+p.h-22);ctx.lineTo(p.x+p.w*.46,p.y+p.h*.58);ctx.lineTo(p.x+p.w-17,p.y+p.h-19);ctx.closePath();ctx.fill();
  });
  // Floor with perspective tile divisions.
  ctx.fillStyle='#212c3d';ctx.fillRect(0,GROUND,W,H-GROUND);
  ctx.fillStyle='#52617a';ctx.fillRect(0,GROUND,W,5);
  ctx.strokeStyle='#43516a';ctx.lineWidth=1;
  for(let x=0;x<W;x+=60) {ctx.beginPath();ctx.moveTo(x,GROUND);ctx.lineTo(x-25,H);ctx.stroke();}
  [490,525].forEach(y=>{ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();});
  // Display labels in the wall.
  ctx.fillStyle='#98aabd';ctx.font='11px monospace';ctx.fillText('GALLERY OF ANTIQUITIES / WING B',27,33);
  ctx.font='10px monospace';ctx.fillStyle='#687e98';ctx.fillText('02:17 AM    //    RESTRICTED ACCESS',27,53);
  // Small emergency light, used for blinking alert feedback.
  const alarm=scan.state==='ALARM';
  ctx.fillStyle=alarm && Math.floor(performance.now()/220)%2===0 ? '#ff6769' : '#813b4f';
  ctx.shadowColor=alarm?'#ff5656':'transparent';ctx.shadowBlur=alarm?28:0;
  ctx.fillRect(910,35,18,12);ctx.shadowBlur=0;
  ctx.fillStyle='#99aabc';ctx.font='10px monospace';ctx.fillText('ALARM',869,27);
}
function drawStatue(exhibit,idx) {
  const x=exhibit.x, y=GROUND;
  const near=Math.abs(player.x-x)<SETTINGS.statueRadius;
  ctx.save();
  // Interactive disguise radius, visible as a subtle halo near the character.
  if(near){ctx.fillStyle='#b9f27d0c';ctx.beginPath();ctx.ellipse(x,GROUND-26,SETTINGS.statueRadius,105,0,0,Math.PI*2);ctx.fill();}
  ctx.fillStyle='#525d75';ctx.fillRect(x-57,y-38,114,38);
  ctx.fillStyle='#8993a6';ctx.fillRect(x-57,y-40,114,8);
  ctx.fillStyle='#343e52';ctx.fillRect(x-48,y-30,96,29);
  ctx.fillStyle='#c4d0d9';ctx.fillRect(x-38,y-22,76,18);
  ctx.fillStyle='#243344';ctx.font='bold 10px monospace';ctx.textAlign='center';ctx.fillText(idx===0?'01 / POSE':'02 / POSE',x,y-8);
  // Body of marble statue.
  const sy=y-40;
  ctx.strokeStyle='#b4c4d2';ctx.lineWidth=15;ctx.lineCap='round';ctx.lineJoin='round';
  ctx.beginPath();ctx.moveTo(x,sy-121);ctx.lineTo(x,sy-49);ctx.moveTo(x,sy-57);ctx.lineTo(x-16,sy-14);ctx.moveTo(x,sy-57);ctx.lineTo(x+16,sy-14);ctx.stroke();
  ctx.lineWidth=11;
  ctx.beginPath();
  if(exhibit.pose==='T_POSE'){
    ctx.moveTo(x,sy-105);ctx.lineTo(x-54,sy-101);ctx.moveTo(x,sy-105);ctx.lineTo(x+54,sy-101);
  }else{
    ctx.moveTo(x,sy-108);ctx.lineTo(x-31,sy-151);ctx.moveTo(x,sy-108);ctx.lineTo(x+31,sy-151);
  }
  ctx.stroke();
  ctx.fillStyle='#d7dfe3';ctx.beginPath();ctx.arc(x,sy-147,18,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#a7b8c7';ctx.beginPath();ctx.ellipse(x-6,sy-152,4,3,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle=near?'#b9f27d':'#a6b3c5';ctx.font='11px monospace';ctx.textAlign='center';
  ctx.fillText(exhibit.pose==='T_POSE'?'T-POSE':'ARMS UP',x,sy-182);
  if(near){ctx.strokeStyle='#b9f27d66';ctx.lineWidth=2;ctx.strokeRect(x-61,y-45,122,48);}
  ctx.restore();
}
function drawTreasure() {
  const x=929;
  ctx.fillStyle='#141e32';ctx.fillRect(x-17,GROUND-88,38,88);
  ctx.strokeStyle='#b6d1dc99';ctx.lineWidth=2;ctx.strokeRect(x-18,GROUND-88,40,83);
  ctx.fillStyle='#e4b665';ctx.beginPath();ctx.moveTo(x,GROUND-72);ctx.lineTo(x+12,GROUND-59);ctx.lineTo(x,GROUND-43);ctx.lineTo(x-12,GROUND-59);ctx.closePath();ctx.fill();
  ctx.fillStyle='#f1dca1';ctx.font='10px monospace';ctx.textAlign='right';ctx.fillText('LOOT',947,GROUND-100);
}
function drawBeam() {
  const {beamHalfAngle:half, beamRange:range} = CAMERA_CONFIG;
  const start = light.angle - half, end = light.angle + half;
  const grad = ctx.createRadialGradient(light.x,light.y,9,light.x,light.y,range);
  grad.addColorStop(0,'rgba(255,255,255,.50)');
  grad.addColorStop(.28,'rgba(248,252,255,.35)');
  grad.addColorStop(.73,'rgba(244,250,255,.23)');
  grad.addColorStop(1,'rgba(239,249,255,.05)');
  ctx.save();
  ctx.beginPath();ctx.moveTo(light.x,light.y);
  for(let i=0;i<=48;i++) {
    const angle=start+(end-start)*i/48;
    ctx.lineTo(light.x+range*Math.cos(angle),light.y+range*Math.sin(angle));
  }
  ctx.closePath();ctx.fillStyle=grad;ctx.fill();
  ctx.strokeStyle='rgba(255,255,255,.61)';ctx.lineWidth=1.8;ctx.stroke();
  ctx.beginPath();ctx.moveTo(light.x,light.y);
  ctx.lineTo(light.x+range*Math.cos(light.angle),light.y+range*Math.sin(light.angle));
  ctx.strokeStyle='rgba(235,246,255,.43)';ctx.lineWidth=1.5;ctx.stroke();
  ctx.restore();
}

function drawSecurityCamera() {
  const x=light.x,y=light.y;
  ctx.save();
  // Ceiling mount / metal cable conduit.
  ctx.strokeStyle='#73849b';ctx.lineWidth=7;ctx.lineCap='round';
  ctx.beginPath();ctx.moveTo(x,y-100);ctx.lineTo(x,y-35);ctx.stroke();
  ctx.strokeStyle='#35445b';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(x,y-100);ctx.lineTo(x,y-40);ctx.stroke();
  ctx.fillStyle='#7789a1';ctx.fillRect(x-30,y-106,60,9);
  ctx.fillStyle='#16253b';ctx.beginPath();ctx.arc(x,y-31,13,0,2*Math.PI);ctx.fill();
  // Rotate the camera housing to match the actual cone direction.
  ctx.translate(x,y-24);ctx.rotate(light.angle-Math.PI/2);
  ctx.fillStyle='#9bacbd';ctx.strokeStyle='#d5e0ea';ctx.lineWidth=2;
  ctx.beginPath();ctx.moveTo(-33,-12);ctx.lineTo(33,-12);ctx.lineTo(27,10);ctx.lineTo(-28,10);ctx.closePath();ctx.fill();ctx.stroke();
  ctx.fillStyle='#526780';ctx.fillRect(-24,-13,48,5);
  ctx.fillStyle='#273a55';ctx.fillRect(-29,6,58,8);
  ctx.fillStyle='#e0e8f0';ctx.beginPath();ctx.ellipse(0,14,19,13,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#172b48';ctx.beginPath();ctx.arc(0,15,10,0,Math.PI*2);ctx.fill();
  ctx.fillStyle=cameraTracking?'#ff7974':'#bcebf7';ctx.beginPath();ctx.arc(0,16,4,0,Math.PI*2);ctx.fill();
  ctx.restore();
  ctx.fillStyle='#c9d8e6';ctx.font='bold 10px monospace';ctx.textAlign='center';
  ctx.fillText('CCTV / 01',x,y-115);
  ctx.fillStyle=cameraTracking?'#ff9a8c':'#abd3e6';
  ctx.font='10px monospace';ctx.fillText(cameraMode,x,y+39);
}

function drawThief() {
  const x=player.x,y=GROUND;
  const pose=input.externalMatch!==null && input.externalMatch?'T_POSE':input.cameraEnabled && tracker.active ? (input.result.matched?nearest().pose:'NONE') : input.selectedPose;
  ctx.save();
  ctx.fillStyle='#090e195e';ctx.beginPath();ctx.ellipse(x,y+2,22,5,0,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle='#cda36b';ctx.lineWidth=8;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(x-8,y-18);ctx.lineTo(x-9,y-3);ctx.moveTo(x+8,y-18);ctx.lineTo(x+9,y-3);ctx.stroke();
  ctx.fillStyle='#efbd79';ctx.fillRect(x-14,y-55,28,37);
  ctx.strokeStyle='#e4b786';ctx.lineWidth=7;ctx.beginPath();
  if(pose==='T_POSE'){
    ctx.moveTo(x-12,y-48);ctx.lineTo(x-33,y-48);ctx.moveTo(x+12,y-48);ctx.lineTo(x+33,y-48);
  }else if(pose==='ARMS_UP'){
    ctx.moveTo(x-12,y-48);ctx.lineTo(x-22,y-84);ctx.moveTo(x+12,y-48);ctx.lineTo(x+22,y-84);
  }else{
    ctx.moveTo(x-12,y-48);ctx.lineTo(x-16,y-25);ctx.moveTo(x+12,y-48);ctx.lineTo(x+16,y-25);
  }ctx.stroke();
  ctx.fillStyle='#f9d2a7';ctx.beginPath();ctx.arc(x,y-66,13,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#192334';ctx.beginPath();ctx.arc(x,y-72,13,Math.PI,Math.PI*2);ctx.lineTo(x+13,y-66);ctx.lineTo(x-13,y-66);ctx.fill();
  ctx.fillStyle='#161f2c';ctx.fillRect(x-8,y-64,5,3);ctx.fillRect(x+3,y-64,5,3);
  ctx.fillStyle='#f0f3f6';ctx.font='bold 10px monospace';ctx.textAlign='center';ctx.fillText('YOU',x,y-100);
  if (scan.state==='SCANNING'||scan.state==='MATCHING'){
    ctx.strokeStyle='#ffb978';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(x,y-41,28,49,0,0,Math.PI*2);ctx.stroke();
  } else if(scan.state==='DISGUISED') {
    ctx.strokeStyle='#b9f27d';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(x,y-41,30,52,0,0,Math.PI*2);ctx.stroke();
  }
  ctx.restore();
}
function drawGameHud() {
  const text = scan.state==='ALARM'?'CAUGHT — SECURITY ALERT':scan.state==='DISGUISED'?'DISGUISE SUCCESSFUL':scan.state==='SCANNING'?'WARNING — COPY THE STATUE':scan.state==='MATCHING'?'HOLD THAT POSE':'STAY OUT OF THE CCTV CONE';
  const color=scan.state==='ALARM'?'#ff787c':scan.state==='DISGUISED'?'#b9f27d':scan.state==='SCANNING'?'#ffcd8e':'#e0eaf6';
  ctx.save();ctx.fillStyle='#0a1424b8';ctx.fillRect(0,H-37,W,37);
  ctx.fillStyle=color;ctx.font='bold 14px monospace';ctx.textAlign='left';ctx.fillText(text,21,H-14);
  ctx.font='11px monospace';ctx.fillStyle='#a3b6c8';ctx.textAlign='right';ctx.fillText('A / D MOVE  •  HOLD 1 OR 2  •  F FORCE SCAN',W-20,H-14);
  if(scan.state==='SCANNING'||scan.state==='MATCHING'){
    ctx.fillStyle='#101b2ee8';ctx.fillRect(0,0,W,48);ctx.fillStyle='#ffd0a3';ctx.textAlign='center';ctx.font='bold 16px monospace';ctx.fillText(`POSE CHALLENGE: ${nearest().pose.replace('_',' ')}  /  ${state.secondsRemaining.toFixed(1)}s LEFT`,W/2,30);
  }
  if(scan.state==='ALARM'){
    if(Math.floor(performance.now()/210)%2===0){ctx.fillStyle='rgba(242,36,54,.28)';ctx.fillRect(0,0,W,H);}
    ctx.fillStyle='rgba(17,12,23,.76)';ctx.fillRect(W/2-215,178,430,105);
    ctx.strokeStyle='#fb636a';ctx.lineWidth=3;ctx.strokeRect(W/2-215,178,430,105);
    ctx.fillStyle='#fff1f1';ctx.font='bold 33px monospace';ctx.textAlign='center';ctx.fillText('SECURITY ALERT!',W/2,221);
    ctx.fillStyle='#f9adad';ctx.font='15px monospace';ctx.fillText('YOU HAVE BEEN SPOTTED',W/2,251);
  }
  ctx.restore();
}
function draw(timestamp) {
  ctx.clearRect(0,0,W,H);
  drawBackdrop();
  drawTreasure();
  exhibits.forEach(drawStatue);
  drawBeam();
  drawSecurityCamera();
  drawThief();
  drawGameHud();
  if (scan.state==='ALARM') el('scene').parentElement.classList.add('alarm-flash');
  else el('scene').parentElement.classList.remove('alarm-flash');
}
function renderStatus() {
  const s=scan.state;
  const statuses = {
    SAFE: ['CCTV ACTIVE','Move beside a sculpture and watch the rotating camera above.','good'],
    SCANNING: ['CCTV TRACKING','Copy the nearest statue immediately. The camera has locked onto you.','warn'],
    MATCHING: ['HOLD YOUR POSE','Keep the correct upper-body pose steady to complete your disguise.','warn'],
    DISGUISED: ['DISGUISE SUCCESS','The camera accepts you as a statue. Its lens returns to patrol mode.','good'],
    ALARM: ['SECURITY ALERT','The CCTV detected an intruder. Reset and try again.','alarm'],
  };
  const record= !running && gameTime===0 ? ['CCTV IDLE','Activate CCTV to start the sweeping camera.',''] : statuses[s];
  el('statusText').textContent=record[0]; el('statusHint').textContent=record[1];
  el('statusLed').className='status-led '+record[2];
  el('alertBar').style.width=`${(state.exposureProgress*100).toFixed(1)}%`;
  el('poseBar').style.width=`${(state.holdProgress*100).toFixed(1)}%`;
  el('remainingText').textContent=state.secondsRemaining.toFixed(1)+'s';
  el('posePercent').textContent=Math.round(state.holdProgress*100)+'%';
  el('scannerText').textContent=cameraMode;
  el('coverText').textContent=closeToStatue()?'IN RANGE':'NONE';
  el('gameClock').textContent=fmtTime(gameTime);
  const exhibit=nearest();
  if (lastPose!==exhibit.pose){
    lastPose=exhibit.pose;
    el('poseTargetText').textContent=exhibit.pose==='T_POSE'?'T-POSE':'ARMS UP';
    el('poseDescription').textContent=exhibit.pose==='T_POSE'?'Stretch both arms sideways.':'Raise both hands above your shoulders.';
    el('poseSketch').innerHTML=exhibit.pose==='T_POSE'
      ? '<svg viewBox="0 0 90 98" width="86" height="94" aria-hidden="true"><circle cx="45" cy="18" r="11" fill="none" stroke="currentColor" stroke-width="6"/><path d="M45 30 V65 M45 40 L17 41 M45 40 L73 41 M45 65 L31 91 M45 65 L59 91" stroke="currentColor" stroke-width="7" fill="none" stroke-linecap="round"/></svg>'
      : '<svg viewBox="0 0 90 98" width="86" height="94" aria-hidden="true"><circle cx="45" cy="26" r="11" fill="none" stroke="currentColor" stroke-width="6"/><path d="M45 37 V70 M45 47 L25 9 M45 47 L65 9 M45 70 L31 92 M45 70 L59 92" stroke="currentColor" stroke-width="7" fill="none" stroke-linecap="round"/></svg>';
  }
  el('poseInputStatus').textContent=input.cameraEnabled && tracker.active
    ? `CAMERA: ${input.result.recognized?(input.result.matched?'POSE MATCHED':'WRONG POSE'):'LANDMARKS NOT FOUND'}`
    : input.externalMatch !== null ? `EXTERNAL INPUT: ${input.externalMatch?'MATCHED':'NOT MATCHED'}`
    : `MANUAL INPUT: ${input.selectedPose.replace('_',' ')}`;
  el('cameraStatus').textContent=tracker.status==='Camera off'
    ? 'Optional: local camera tracking needs internet access for MediaPipe model files. Manual controls work without camera.'
    : tracker.status;
}
function animate(timestamp) {
  const dt=lastTime?timestamp-lastTime:0;
  lastTime=timestamp;
  simulation(dt,timestamp);
  if(scan.state==='ALARM' && !caughtOverlayShown){
    alarmVisualTime+=Math.min(dt,50);
    if(alarmVisualTime>2300){caughtOverlayShown=true;showOverlay('MISSION FAILED','The CCTV camera identified the thief before the required statue pose was held.','RETRY CCTV');}
  }
  draw(timestamp);
  renderStatus();
  requestAnimationFrame(animate);
}
function setManualPose(pose,active) {
  if (input.cameraEnabled) return;
  input.selectedPose=active?pose:'NONE';
  el('manualT').classList.toggle('active',input.selectedPose==='T_POSE');
  el('manualUp').classList.toggle('active',input.selectedPose==='ARMS_UP');
}
function bindHoldButton(id,pose){
  const button=el(id);
  button.addEventListener('pointerdown',e=>{e.preventDefault();button.setPointerCapture(e.pointerId);setManualPose(pose,true);});
  button.addEventListener('pointerup',()=>setManualPose(pose,false));
  button.addEventListener('pointercancel',()=>setManualPose(pose,false));
  button.addEventListener('lostpointercapture',()=>setManualPose(pose,false));
}
bindHoldButton('manualT','T_POSE');
bindHoldButton('manualUp','ARMS_UP');
el('startOverlay').addEventListener('click',start);
el('startBtn').addEventListener('click',start);
el('pauseBtn').addEventListener('click',setPause);
el('resetBtn').addEventListener('click',reset);
el('focusBtn').addEventListener('click',focusBeam);
el('cameraBtn').addEventListener('click',async()=>{
  if(tracker.active){ tracker.stop();input.cameraEnabled=false;el('cameraBtn').textContent='Enable webcam tracking';el('cameraPlaceholder').style.display='block';return; }
  el('cameraBtn').disabled=true;el('cameraBtn').textContent='Loading camera…';
  try{
    await tracker.start();
    input.cameraEnabled=true;
    el('cameraPlaceholder').style.display='none';
    el('cameraBtn').textContent='Stop webcam tracking';
    input.selectedPose='NONE';
  }catch(error){
    tracker.stop(); input.cameraEnabled=false;
    tracker.status=`Camera unavailable: ${error.message}. Use manual mode.`;
    el('cameraBtn').textContent='Try webcam again';
    el('cameraPlaceholder').style.display='block';
  }finally{el('cameraBtn').disabled=false;}
});
window.addEventListener('keydown',e=>{
  const k=e.key.toLowerCase();
  if(['arrowleft','arrowright','1','2','f','a','d',' '].includes(k)) e.preventDefault();
  keys.add(k);
  if(k==='1')setManualPose('T_POSE',true);
  if(k==='2')setManualPose('ARMS_UP',true);
  if(k==='f'&&!e.repeat) focusBeam();
  if(k===' '&&!e.repeat) running?setPause():start();
});
window.addEventListener('keyup',e=>{
  const k=e.key.toLowerCase();keys.delete(k);
  if(k==='1'&&input.selectedPose==='T_POSE')setManualPose('T_POSE',false);
  if(k==='2'&&input.selectedPose==='ARMS_UP')setManualPose('ARMS_UP',false);
});
window.addEventListener('blur',()=>{keys.clear();if(!input.cameraEnabled) setManualPose('T_POSE',false);});
window.addEventListener('beforeunload',()=>tracker.stop());

// Integration hooks: the team's future pose module can provide a boolean without
// importing this demo or using simulated key inputs.
window.museumHeistDemo = Object.freeze({
  setPoseMatch(value){input.externalMatch = typeof value==='boolean'?value:null;},
  clearPoseOverride(){input.externalMatch=null;},
  getState(){return {state:scan.state,secondsRemaining:state.secondsRemaining,poseTarget:nearest().pose,nearExhibit:closeToStatue(),exposureProgress:state.exposureProgress,holdProgress:state.holdProgress,disguisedCount:successfulDisguises};},
  reset, focusBeam,
  getCameraState(){return {mode:cameraMode, angle:light.angle, x:light.x, y:light.y, tracking:cameraTracking};},
});

reset();
requestAnimationFrame(animate);

const $ = id => document.getElementById(id);
const ROUND_PAUSE_MS = 3000;
const inStreetEscape = window.parent !== window;
const names = {rock:'石头',paper:'布',scissors:'剪刀'};
const beats = {rock:'scissors',paper:'rock',scissors:'paper'};
const policeGestureArt = {
  rock: new URL('./assets/police-rock.png', import.meta.url).href,
  paper: new URL('./assets/police-paper.png', import.meta.url).href,
  scissors: new URL('./assets/police-scissors.png', import.meta.url).href,
};
const edges = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];
const state = {mode:'idle',stream:null,ownsStream:false,model:null,lastVideo:-1,detected:null,stable:null,frames:0,selected:'paper',timer:null,gestureTimer:null,revealTimer:null,roundPause:null,raf:0,round:0,playerWins:0,policeWins:0,history:[]};
const $video=$('camera'),$canvas=$('landmarks'),ctx=$canvas.getContext('2d');
let challengeInput = null;
function distance(a,b){return Math.hypot(a.x-b.x,a.y-b.y)}
function classify(p){
  if(!p?.length)return null;
  const open=[[8,6],[12,10],[16,14],[20,18]].map(([tip,pip])=>distance(p[tip],p[0])>distance(p[pip],p[0])*1.12);
  if(open.every(Boolean))return 'paper';
  if(open[0]&&open[1]&&!open[2]&&!open[3])return 'scissors';
  if(open.every(v=>!v))return 'rock';
  return null;
}
function draw(points){ctx.clearRect(0,0,$canvas.width,$canvas.height);if(!points)return;ctx.strokeStyle='#5cf4e9';ctx.fillStyle='#ffd56c';ctx.lineWidth=3;for(const [a,b] of edges){ctx.beginPath();ctx.moveTo(points[a].x*$canvas.width,points[a].y*$canvas.height);ctx.lineTo(points[b].x*$canvas.width,points[b].y*$canvas.height);ctx.stroke()}for(const p of points)ctx.fillRect(p.x*$canvas.width-3,p.y*$canvas.height-3,6,6)}
function showGesture(g){
  // The lower-left panel belongs only to the guard; the player's hand is shown in the scanner and under the thief portrait.
  $('detected').textContent=g?`当前识别：${names[g]}`:'请将一只手放进扫描框';
}
function highlightCountdownGesture(gesture){
  document.querySelectorAll('.hands>div').forEach(el=>el.classList.toggle('countdown-active',el.dataset.gesture===gesture));
}
function clearCountdownGesture(){document.querySelectorAll('.hands>div').forEach(el=>el.classList.remove('countdown-active'))}
function showPoliceGesture(g){
  const choice=$('police-choice');
  choice.replaceChildren();
  if(!g)return;
  const image=document.createElement('img');
  image.src=policeGestureArt[g];
  image.alt=`保安出${names[g]}`;
  choice.append(image);
}
function showPlayerGesture(g){
  const choice=$('player-choice');
  choice.replaceChildren();
  if(!g)return;
  const image=document.createElement('img');
  image.src=policeGestureArt[g];
  image.alt=`你出${names[g]}`;
  choice.append(image);
}
function setResult(text,kind=''){$('result').textContent=text;$('result').className='result '+kind}
async function loadCamera(sharedStream){
  $('camera-status').textContent='加载识别中…';
  const stream = sharedStream ?? await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:640},height:{ideal:480}},audio:false});
  state.ownsStream = !sharedStream;
  state.stream=stream;$video.srcObject=stream;await $video.play();$canvas.width=$video.videoWidth;$canvas.height=$video.videoHeight;
  try{
    const mp=await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/+esm');
    const vision=await mp.FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm');
    const opts={baseOptions:{modelAssetPath:'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',delegate:'GPU'},runningMode:'VIDEO',numHands:1};
    try{state.model=await mp.HandLandmarker.createFromOptions(vision,opts)}catch{state.model=await mp.HandLandmarker.createFromOptions(vision,{...opts,baseOptions:{...opts.baseOptions,delegate:'CPU'}})}
  }catch(error){stopCamera();throw new Error('模型加载失败，请检查网络连接。'+(error?.message||''))}
  state.mode='camera';$('camera-status').textContent='实时识别中';document.querySelector('.preview').classList.add('ready');scan();
}
function scan(){if(state.mode!=='camera')return;state.raf=requestAnimationFrame(scan);if($video.readyState<2||$video.currentTime===state.lastVideo)return;state.lastVideo=$video.currentTime;try{const points=state.model.detectForVideo($video,performance.now()).landmarks?.[0];draw(points);const g=classify(points);state.frames=g&&g===state.detected?state.frames+1:1;state.detected=g;if(state.frames>=3)state.stable=g;showGesture(state.stable)}catch{$('camera-status').textContent='识别暂时中断'}}
function stopCamera() {
  cancelAnimationFrame(state.raf);
  if (state.ownsStream) state.stream?.getTracks().forEach((track) => track.stop());
  state.stream = null;
  state.ownsStream = false;
  $video.srcObject = null;
  state.model?.close?.();
  state.model = null;
  document.querySelector('.preview').classList.remove('ready');
  ctx.clearRect(0, 0, $canvas.width, $canvas.height);
}
function renderScore(){
  $('round-label').textContent=`第 ${Math.min(state.round+1,3)} / 3 回合`;
  $('score').textContent=`你 ${state.playerWins} : ${state.policeWins} 保安`;
  document.querySelectorAll('#round-marks b').forEach((el,i)=>{el.textContent=state.history[i]==='win'?'✓':state.history[i]==='lose'?'×':state.history[i]==='tie'?'—':i+1;el.className=state.history[i]||''});
}
function reveal(player, police){
  if(!player){$('count').textContent='？';$('count').className='count outcome-lose';$('phase').textContent='没有识别到石头、剪刀或布';setResult('本回合未出拳，请再试一次','lose');$('retry').textContent='重试本回合';$('retry').hidden=false;return}
  showPoliceGesture(police);showPlayerGesture(player);$('phase').textContent='';
  const outcome=police===player?'tie':beats[player]===police?'win':'lose';
  $('count').textContent=outcome==='win'?'胜利！':outcome==='lose'?'失败！':'平局！';
  $('count').className=`count outcome-${outcome}`;
  state.history.push(outcome);state.round++;if(outcome==='win')state.playerWins++;if(outcome==='lose')state.policeWins++;
  renderScore();
  if (state.round < 3) {
    setResult('3 秒后开始下一回合');
    state.roundPause = setTimeout(countdown, ROUND_PAUSE_MS);
    return;
  }
  stopCamera();state.mode='idle';$('round-label').textContent='三回合结束';
  const difference = state.playerWins - state.policeWins;
  if (difference === 0) {
    setResult(`三回合 ${state.playerWins}:${state.policeWins} 平局，请重新挑战`);
  } else {
    const outcome = difference > 0 ? 'win' : 'lose';
    if (outcome === 'win') {
      setResult(inStreetEscape
        ? `你以 ${state.playerWins}:${state.policeWins} 获胜！保安将被制住 3 秒，准备继续逃跑。`
        : `三回合你以 ${state.playerWins}:${state.policeWins} 获胜，成功逃脱！`, 'win');
    } else {
      setResult(inStreetEscape
        ? `保安以 ${state.policeWins}:${state.playerWins} 获胜，警戒上升！`
        : `保安以 ${state.policeWins}:${state.playerWins} 获胜，小偷被逮捕。`, 'lose');
    }
    if (inStreetEscape) {
      state.roundPause = setTimeout(() => {
        window.parent.postMessage({ type: 'street-rps-result', outcome }, window.location.origin);
      }, ROUND_PAUSE_MS);
      return;
    }
  }
  $('retry').textContent='重新挑战';$('retry').hidden=false;
}
function countdown(){
  let n=3,spinIndex=0;
  const gestures=['rock','paper','scissors'];
  const police = gestures[Math.floor(Math.random() * gestures.length)];
  $('retry').hidden=true;$('start').hidden=true;$('demo').hidden=true;
  showPoliceGesture(null);showPlayerGesture(null);$('count').className='count';$('count').textContent=n;
  const spin=()=>highlightCountdownGesture(gestures[spinIndex++%gestures.length]);
  spin();
  state.gestureTimer=setInterval(spin,130);
  $('phase').textContent=`第 ${state.round+1} 回合：倒数结束时锁定手势`;setResult('');
  state.timer = setInterval(() => {
    n--;
    if (n > 0) {
      $('count').textContent = n;
      $('count').classList.remove('tick');
      void $('count').offsetWidth;
      $('count').classList.add('tick');
      return;
    }

    clearInterval(state.timer);
    clearInterval(state.gestureTimer);
    const player = state.mode === 'demo' ? state.selected : state.stable;
    highlightCountdownGesture(police);
    state.revealTimer = setTimeout(() => {
      clearCountdownGesture();
      reveal(player, police);
    }, 260);
  }, 1000);
}
function clearRoundTimers() {
  clearInterval(state.timer);
  clearInterval(state.gestureTimer);
  clearTimeout(state.revealTimer);
  clearTimeout(state.roundPause);
}
function reset() {
  clearRoundTimers();
  stopCamera();
  clearCountdownGesture();
  Object.assign(state, {
    mode: 'idle', detected: null, stable: null, frames: 0, lastVideo: -1,
    round: 0, playerWins: 0, policeWins: 0, history: [],
  });
  $('count').className = 'count';
  $('count').textContent = '准备';
  $('phase').textContent = '';
  showPoliceGesture(null);
  showPlayerGesture(null);
  $('camera-status').textContent = '摄像头未启动';
  $('retry').hidden = true;
  for (const button of [$('start'), $('demo')]) {
    button.hidden = inStreetEscape;
    button.disabled = false;
  }
  setResult('准备好后开始挑战');
  showGesture(null);
  renderScore();
}

function startDemo(status = '演示模式') {
  reset();
  state.mode = 'demo';
  showGesture(state.selected);
  $('camera-cover').textContent = '在左下角选择要出的拳';
  $('camera-status').textContent = status;
  countdown();
}

async function startCamera(stream) {
  reset();
  $('start').disabled = true;
  $('demo').disabled = true;
  $('camera-cover').textContent = '请露出一只完整的手';
  setResult(stream ? '正在加载手势识别…' : '正在启动摄像头与手势识别…');
  try {
    await loadCamera(stream);
    countdown();
  } catch (error) {
    stopCamera();
    if (inStreetEscape) {
      startDemo('手势识别暂不可用，已切换为演示模式');
      return;
    }
    setResult(error.message, 'lose');
    $('camera-status').textContent = '启动失败';
    $('start').disabled = false;
    $('demo').disabled = false;
  }
}

function startStreetChallenge() {
  const stream = challengeInput?.stream;
  if (stream?.getVideoTracks().some((track) => track.readyState === 'live')) {
    void startCamera(stream);
  } else {
    startDemo();
  }
}

if (inStreetEscape) {
  document.documentElement.classList.add('rps-in-escape');
  window.addEventListener('street-rps-start', (event) => {
    if (challengeInput) return;
    challengeInput = event.detail;
    startStreetChallenge();
  });
} else {
  $('start').hidden = false;
  $('demo').hidden = false;
  $('start').onclick = () => startCamera();
  $('demo').onclick = () => startDemo();
}
$('retry').onclick = () => {
  if (state.round < 3 && state.mode !== 'idle') countdown();
  else if (inStreetEscape) startStreetChallenge();
  else reset();
};
document.querySelectorAll('.hands>div').forEach(el=>el.onclick=()=>{if(state.mode==='camera')return;state.selected=el.dataset.gesture;showGesture(state.selected)});
window.addEventListener('beforeunload', () => {
  clearRoundTimers();
  stopCamera();
});

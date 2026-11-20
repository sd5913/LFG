const $ = id => document.getElementById(id);
const names = {rock:'石头',paper:'布',scissors:'剪刀'};
const beats = {rock:'scissors',paper:'rock',scissors:'paper'};
const edges = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];
const state = {mode:'idle',stream:null,model:null,lastVideo:-1,detected:null,stable:null,frames:0,selected:'paper',timer:null,raf:0,round:0,playerWins:0,policeWins:0,history:[]};
const $video=$('camera'),$canvas=$('landmarks'),ctx=$canvas.getContext('2d');
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
function showGesture(g){document.querySelectorAll('.hands>div').forEach(el=>el.classList.toggle('active',el.dataset.gesture===g));$('detected').textContent=g?`当前识别：${names[g]}`:'请将一只手放进扫描框'}
function setResult(text,kind=''){$('result').textContent=text;$('result').className='result '+kind}
async function loadCamera(){
  $('camera-status').textContent='加载识别中…';
  const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:640},height:{ideal:480}},audio:false});
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
function stopCamera(){cancelAnimationFrame(state.raf);state.stream?.getTracks().forEach(t=>t.stop());state.stream=null;$video.srcObject=null;state.model?.close?.();state.model=null;document.querySelector('.preview').classList.remove('ready');ctx.clearRect(0,0,$canvas.width,$canvas.height)}
function renderScore(){
  $('round-label').textContent=`第 ${Math.min(state.round+1,3)} / 3 回合`;
  $('score').textContent=`你 ${state.playerWins} : ${state.policeWins} 警官`;
  document.querySelectorAll('#round-marks b').forEach((el,i)=>{el.textContent=state.history[i]==='win'?'✓':state.history[i]==='lose'?'×':state.history[i]==='tie'?'—':i+1;el.className=state.history[i]||''});
}
function reveal(){
  const player=state.mode==='demo'?state.selected:state.stable;
  if(!player){$('count').textContent='？';$('phase').textContent='没有识别到石头、剪刀或布';setResult('本回合未出拳，请再试一次','lose');$('retry').textContent='重试本回合';$('retry').hidden=false;return}
  const police=['rock','paper','scissors'][Math.floor(Math.random()*3)];
  $('police-choice').textContent=names[police];$('player-choice').textContent=names[player];$('count').textContent='出拳！';$('phase').textContent=`警官：${names[police]}　你：${names[player]}`;
  const outcome=police===player?'tie':beats[player]===police?'win':'lose';
  state.history.push(outcome);state.round++;if(outcome==='win')state.playerWins++;if(outcome==='lose')state.policeWins++;
  renderScore();
  if(state.round<3){setResult(outcome==='win'?'本回合你赢了，继续下一回合':outcome==='lose'?'本回合警官赢了，继续下一回合':'本回合平局，继续下一回合',outcome==='tie'?'':outcome);$('retry').textContent='下一回合';$('retry').hidden=false;return}
  stopCamera();state.mode='idle';$('round-label').textContent='三回合结束';
  if(state.playerWins>state.policeWins)setResult(`三回合你以 ${state.playerWins}:${state.policeWins} 获胜，成功逃脱！`,'win');
  else if(state.playerWins<state.policeWins)setResult(`三回合警官以 ${state.policeWins}:${state.playerWins} 获胜，挑战失败`,'lose');
  else setResult(`三回合 ${state.playerWins}:${state.policeWins} 平局，请重新挑战`);
  $('retry').textContent='重新挑战';$('retry').hidden=false;
}
function countdown(){let n=3;$('retry').hidden=true;$('start').hidden=true;$('demo').hidden=true;$('police-choice').textContent='？';$('player-choice').textContent='？';$('count').textContent=n;$('phase').textContent=`第 ${state.round+1} 回合：倒数结束时锁定手势`;setResult('观察警官，准备猜拳');state.timer=setInterval(()=>{n--;if(n>0){$('count').textContent=n;$('count').classList.remove('tick');void $('count').offsetWidth;$('count').classList.add('tick')}else{clearInterval(state.timer);reveal()}},1000)}
function reset(){clearInterval(state.timer);stopCamera();state.mode='idle';state.detected=null;state.stable=null;state.frames=0;state.round=0;state.playerWins=0;state.policeWins=0;state.history=[];$('count').textContent='准备';$('phase').textContent='让手进入镜头，然后开始倒计时';$('police-choice').textContent='？';$('player-choice').textContent='？';$('camera-status').textContent='摄像头未启动';$('retry').hidden=true;$('start').hidden=false;$('demo').hidden=false;$('start').disabled=false;$('demo').disabled=false;setResult('准备好后开始挑战');showGesture(null);renderScore()}
$('start').onclick=async()=>{reset();$('start').disabled=true;setResult('正在启动摄像头与手势识别…');try{await loadCamera();countdown()}catch(error){setResult(error.message,'lose');$('camera-status').textContent='启动失败';$('start').disabled=false}};
$('demo').onclick=()=>{reset();state.mode='demo';showGesture(state.selected);$('camera-status').textContent='演示模式';$('phase').textContent='点击左下角手势选择你要出的拳';countdown()};
$('retry').onclick=()=>state.round<3&&state.mode!=='idle'?countdown():reset();
document.querySelectorAll('.hands>div').forEach(el=>el.onclick=()=>{if(state.mode==='camera')return;state.selected=el.dataset.gesture;showGesture(state.selected)});
window.addEventListener('beforeunload',()=>{stopCamera();state.model?.close?.()});

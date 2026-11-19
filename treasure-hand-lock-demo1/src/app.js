import { analyzeHand, GESTURES } from './hand-gestures.js';
import { UnlockMachine, STEPS } from './unlock-machine.js';

const TASKS_VERSION = '0.10.14';
const MP_MODULE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VERSION}`;
const WASM_ROOT = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VERSION}/wasm`;
const HAND_MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const ASSET_ROOT = './assets/unlock-ui-components';
const $ = (id) => document.getElementById(id);
const video = $('webcam');
const cardAssets = ['gesture_step_01_index', 'gesture_step_02_pinch', 'gesture_step_03_fist', 'gesture_step_04_side_fist'];
const targetAssets = ['gesture_index_gold.png', 'gesture_pinch_gold.png', 'gesture_fist_gold.png', 'gesture_side_fist_gold.png'];
const cardLefts = [20.82, 38.3, 55.3, 70.92];
const nodeLefts = [0, 25.5, 51, 76.5];
const instructions = [
  ['伸出食指', '其余手指握起并保持'], ['拇指食指捏合', '让两指靠近，保持稳定'],
  ['握紧拳头', '五指收拢，保持握拳'], ['捏合并旋转', '保持握拳，在画面内缓慢转动'],
];
const labels = { NONE: '未检测到手', UNKNOWN: '正在识别手势', OPEN: '张开手掌', POINT: '食指手势', PINCH: '捏合手势', FIST: '握拳手势' };
const state = { stream: null, landmarker: null, loading: false, scanning: false, session: 0, lastVideoTime: -1, lastInferenceAt: 0, hand: null, lastSeen: 0, lastGesture: GESTURES.NONE };
const machine = new UnlockMachine(onMachineEvent);

const cardImage = (name, status) => `${ASSET_ROOT}/gestures/${name}_${status}.png`;
function buildStaticUi() {
  $('top-cards').replaceChildren(...cardAssets.map((asset, index) => {
    const card = document.createElement('div');
    card.className = 'gesture-card'; card.dataset.index = index; card.style.left = `${cardLefts[index]}%`;
    card.innerHTML = `<img class="card-art" alt="第 ${index + 1} 步手势" src="${cardImage(asset, 'idle')}"><img class="selection-frame" alt="" src="${ASSET_ROOT}/gestures/gesture_selection_frame.png"><img class="completed-check" alt="完成" src="${ASSET_ROOT}/gestures/gesture_completed_check.png">`;
    return card;
  }));
  $('progress-nodes').replaceChildren(...cardAssets.map((_, index) => {
    const node = document.createElement('div');
    node.className = 'progress-node'; node.dataset.index = index; node.style.left = `${nodeLefts[index]}%`;
    node.innerHTML = `<img alt="第 ${index + 1} 步进度" src="${ASSET_ROOT}/progress/progress_token_idle.png">`;
    return node;
  }));
}
function setStatus(text) { $('scan-status').textContent = text; }
function message(text, success = false) { $('unlock-message').textContent = text; $('unlock-message').classList.toggle('success', success); }
function reset() {
  $('unlock-stage').classList.remove('unlock-success');
  $('success-sequence').setAttribute('aria-hidden', 'true');
  machine.reset(); state.hand = null; state.lastGesture = GESTURES.NONE; state.lastSeen = 0;
  message(state.scanning ? '请从第一个手势开始解锁。' : '开启扫描后，依次完成四个手势。'); render(machine.snapshot());
}
function onMachineEvent(event) {
  if (event.type === 'step-complete') message(event.step === 'ROTATE' ? '宝箱已解锁！' : `第 ${event.stepIndex} 步完成，继续下一个手势。`, event.step === 'ROTATE');
  if (event.type === 'unlocked') {
    $('unlock-stage').classList.add('unlock-success');
    $('success-sequence').setAttribute('aria-hidden', 'false');
    window.dispatchEvent(new CustomEvent('lfg:treasure-unlocked', { detail: { item: 'ancient-relic', unlocked: true } }));
  }
}
function render(snapshot) {
  const current = Math.min(snapshot.stepIndex, 3);
  const showActiveStep = state.scanning || snapshot.stepIndex > 0 || snapshot.unlocked;
  const expected = snapshot.unlocked ? 'OPENED' : (current === 3 ? 'FIST' : STEPS[current].id);
  const hasRecentHand = state.scanning && performance.now() - state.lastSeen < 500;
  const matches = hasRecentHand && state.lastGesture === expected && !snapshot.unlocked;
  const feedback = document.querySelector('.feedback-panel');
  feedback.classList.toggle('matching', matches || snapshot.unlocked);
  $('feedback-kicker').textContent = snapshot.unlocked ? '解锁完成' : matches ? '目标手势匹配' : state.scanning ? '实时手势识别' : '识别待机';
  $('gesture-name').textContent = snapshot.unlocked ? '宝箱已开启' : (state.scanning ? labels[state.lastGesture] || '正在识别' : '等待开启扫描');
  $('feedback-detail').textContent = snapshot.unlocked ? '四个目标手势已完成' : matches ? '保持当前动作以累积进度' : state.scanning ? '将一只手置于摄像头前' : '点击上方按钮开始本地手势识别';
  document.querySelectorAll('.gesture-card').forEach((card, index) => {
    const status = snapshot.unlocked || index < snapshot.stepIndex ? 'completed' : showActiveStep && index === current ? 'selected' : 'idle';
    card.classList.toggle('selected', status === 'selected'); card.classList.toggle('completed', status === 'completed');
    card.querySelector('.card-art').src = cardImage(cardAssets[index], status);
  });
  document.querySelectorAll('.progress-node').forEach((node, index) => {
    const status = snapshot.unlocked || index < snapshot.stepIndex ? 'completed' : showActiveStep && index === current ? 'selected' : 'idle';
    node.classList.toggle('selected', status === 'selected'); node.querySelector('img').src = `${ASSET_ROOT}/progress/progress_token_${status}.png`;
  });
  const totalProgress = snapshot.unlocked ? 1 : (snapshot.stepIndex + snapshot.progress) / STEPS.length;
  $('progress-fill').style.transform = `scaleX(${totalProgress})`;
  const [title, detail] = snapshot.unlocked ? ['宝箱已解锁', '四个手势序列已完成'] : instructions[current];
  $('instruction-title').textContent = title; $('instruction-detail').textContent = detail;
  $('target-icon').src = `${ASSET_ROOT}/instruction-icons/${targetAssets[current]}`; $('target-icon').alt = title;
  document.querySelector('.instruction-panel').classList.toggle('rotate', current === 3 && !snapshot.unlocked);
  const rotation = current === 3 ? Math.min(snapshot.rotationDegrees, 75) : Math.min(18, (current + snapshot.progress) * 6);
  $('dial-rotor').style.transform = `rotate(${rotation}deg)`;
  document.querySelector('.dial').classList.toggle('active', matches || (current === 3 && snapshot.progress > 0));
}
async function startScan() {
  if (state.loading || state.scanning) return;
  state.loading = true; const session = ++state.session;
  $('scan-toggle').disabled = true; setStatus('正在连接摄像头…'); message('正在加载本地手势识别模型，首次使用可能需要片刻。');
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('当前浏览器不支持摄像头。请使用 Chrome、Edge 或 VS Code 内置浏览器打开 localhost。');
    if (!window.isSecureContext) throw new Error('手势扫描需要 HTTPS 或 localhost 环境。');
    const [mp, stream] = await Promise.all([import(MP_MODULE), navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false })]);
    if (session !== state.session) { stream.getTracks().forEach((track) => track.stop()); return; }
    state.stream = stream; video.srcObject = stream; await video.play();
    const vision = await mp.FilesetResolver.forVisionTasks(WASM_ROOT);
    const options = { baseOptions: { modelAssetPath: HAND_MODEL_URL, delegate: 'GPU' }, runningMode: 'VIDEO', numHands: 1, minHandDetectionConfidence: .5, minHandPresenceConfidence: .5, minTrackingConfidence: .5 };
    try { state.landmarker = await mp.HandLandmarker.createFromOptions(vision, options); }
    catch { state.landmarker = await mp.HandLandmarker.createFromOptions(vision, { ...options, baseOptions: { modelAssetPath: HAND_MODEL_URL, delegate: 'CPU' } }); }
    if (session !== state.session) return;
    state.scanning = true; state.lastVideoTime = -1; state.lastInferenceAt = 0; state.lastGesture = GESTURES.NONE;
    $('scan-toggle').textContent = '关闭手势扫描'; $('scan-toggle').classList.add('scanning'); $('scan-toggle').disabled = false;
    setStatus('本地识别已开启'); message('摄像头画面不会显示；请在镜头前完成第一个食指手势。');
  } catch (error) {
    if (session !== state.session) return;
    stopScan(false); message(`无法开启手势扫描：${error?.message || String(error)}`); setStatus('开启失败');
  } finally { if (session === state.session) state.loading = false; $('scan-toggle').disabled = false; }
}
function stopScan(showMessage = true) {
  ++state.session; state.loading = false; state.scanning = false; state.hand = null; state.lastGesture = GESTURES.NONE;
  if (state.stream) state.stream.getTracks().forEach((track) => track.stop());
  state.stream = null; video.pause(); video.srcObject = null; state.landmarker?.close?.(); state.landmarker = null;
  $('scan-toggle').textContent = '开启手势扫描'; $('scan-toggle').classList.remove('scanning');
  if (showMessage) message('手势扫描已关闭。摄像头画面从未显示或保存。');
  setStatus('摄像头未开启'); render(machine.snapshot());
}
function infer(now) {
  if (!state.scanning || !state.landmarker || !state.stream || video.readyState < 2) return;
  if (now - state.lastInferenceAt < 55 || video.currentTime === state.lastVideoTime) return;
  state.lastInferenceAt = now; state.lastVideoTime = video.currentTime;
  try {
    const result = state.landmarker.detectForVideo(video, now); const points = result.landmarks?.[0] || null;
    state.hand = points ? analyzeHand(points) : null; state.lastGesture = state.hand?.gesture || GESTURES.NONE;
    if (points) state.lastSeen = now;
  } catch { state.lastGesture = GESTURES.NONE; }
}
function frame(now) { infer(now); render(machine.update({ gesture: state.scanning ? state.lastGesture : GESTURES.NONE, angle: state.hand?.angle ?? null, now })); requestAnimationFrame(frame); }
buildStaticUi(); $('scan-toggle').addEventListener('click', () => state.scanning ? stopScan() : startScan()); $('reset-btn').addEventListener('click', reset);
window.addEventListener('beforeunload', () => { state.stream?.getTracks().forEach((track) => track.stop()); state.landmarker?.close?.(); });
reset(); requestAnimationFrame(frame);
if (new URLSearchParams(location.search).get('preview') === 'success') {
  requestAnimationFrame(() => { $('unlock-stage').classList.add('unlock-success'); $('success-sequence').setAttribute('aria-hidden', 'false'); });
}

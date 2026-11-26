import { publicAsset } from './public-asset.js';
import { useGameText } from './use-game-language.js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { analyzeHand, GESTURES, HAND_EDGES } from './hand-gestures.js';
import { STEPS, UnlockMachine } from './unlock-machine.js';

const TASKS_VERSION = '0.10.14';
const MEDIAPIPE_MODULE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VERSION}`;
const WASM_ROOT = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VERSION}/wasm`;
const HAND_MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const ASSET_ROOT = publicAsset('unlock-ui');
const CARD_ASSETS = ['gesture_step_01_index', 'gesture_step_02_pinch', 'gesture_step_03_fist', 'gesture_step_04_side_fist'];
const TARGET_ASSETS = ['gesture_index_gold.png', 'gesture_pinch_gold.png', 'gesture_fist_gold.png', 'gesture_side_fist_gold.png'];
const CARD_LEFTS = [20.82, 38.3, 55.3, 70.92];
const NODE_LEFTS = [0, 25.5, 51, 76.5];
const labels = { NONE: ['未检测到手', 'No hand detected'], UNKNOWN: ['正在识别手势', 'Detecting gesture'], OPEN: ['张开手掌', 'Open palm'], POINT: ['食指手势', 'Index finger'], PINCH: ['捏合手势', 'Pinch'], FIST: ['握拳手势', 'Fist'] };

const cardAsset = (asset, status) => `${ASSET_ROOT}/${asset}_${status}.png`;

function drawSkeleton(canvas, landmarks, matches) {
  const context = canvas?.getContext('2d');
  if (!context || !canvas) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  if (!landmarks) return;
  const { width, height } = canvas;
  context.lineCap = 'round'; context.lineJoin = 'round'; context.lineWidth = 10;
  context.strokeStyle = matches ? '#70ffc0' : '#36e8f1';
  context.shadowColor = matches ? '#54ff9e' : '#2ed9e7'; context.shadowBlur = 16;
  context.beginPath();
  HAND_EDGES.forEach(([from, to]) => { context.moveTo(landmarks[from].x * width, landmarks[from].y * height); context.lineTo(landmarks[to].x * width, landmarks[to].y * height); });
  context.stroke();
  landmarks.forEach((point, index) => {
    context.beginPath(); context.arc(point.x * width, point.y * height, [4, 8, 12, 16, 20].includes(index) ? 12 : 7, 0, Math.PI * 2);
    context.fillStyle = [4, 8].includes(index) ? '#ffd260' : '#e9ffff'; context.fill();
  });
  context.shadowBlur = 0;
}

function ChestUnlockSequence({ phase }) {
  const t = useGameText();
  return <section className={`unlock-chest-sequence ${phase}`} aria-live="polite" aria-label={phase === 'animation' ? t('宝箱开启中', 'Opening the chest') : t('偷取宝藏成功', 'Treasure secured')}>
    <span className="unlock-alert-paused">{t('警戒已暂停', 'Alert paused')}</span>
    <div className="unlock-chest-animation" aria-hidden="true">
      <img className="unlock-chest-closed" src={publicAsset('unlock-animation/chest_closed.png')} alt="" />
      <img className="unlock-chest-open" src={publicAsset('unlock-animation/chest_open.png')} alt="" />
      <div className="unlock-chest-lid"><img src={publicAsset('unlock-animation/chest_closed.png')} alt="" /></div>
      <div className="unlock-chest-dial">
        <img className="unlock-chest-rotor" src={publicAsset('unlock-animation/dial_rotor.png')} alt="" />
        <img className="unlock-chest-hub" src={publicAsset('unlock-animation/dial_hub.png')} alt="" />
        <img className="unlock-chest-pointer" src={publicAsset('unlock-animation/dial_pointer.png')} alt="" />
      </div>
    </div>
    {phase === 'success' && <section className="unlock-success-card" role="status">
      <span>{t('任务完成', 'MISSION COMPLETE')}</span>
      <strong>{t('成功偷取宝藏', 'Treasure secured')}</strong>
      <p>{t('宝藏已收入囊中，即将开始逃离博物馆。', 'You have the treasure. The escape is about to begin.')}</p>
    </section>}
  </section>;
}

export function TreasureUnlock({ cameraStream, onComplete, onExit }) {
  const t = useGameText();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const ownsStreamRef = useRef(false);
  const landmarkerRef = useRef(null);
  const frameRef = useRef(0);
  const lastVideoTimeRef = useRef(-1);
  const lastInferenceRef = useRef(0);
  const gestureRef = useRef(GESTURES.NONE);
  const angleRef = useRef(null);
  const lastSeenRef = useRef(0);
  const machineRef = useRef(new UnlockMachine());
  const completedRef = useRef(false);
  const [scanning, setScanning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [unlockPhase, setUnlockPhase] = useState('challenge');
  const [status, setStatus] = useState(['摄像头未开启', 'Camera off']);
  const [message, setMessage] = useState(['开启扫描后，依次完成四个手势。', 'Start the scanner and complete the four gestures in order.']);
  const [snapshot, setSnapshot] = useState(() => machineRef.current.snapshot());
  const [lastGesture, setLastGesture] = useState(GESTURES.NONE);

  const releaseSensor = useCallback(() => {
    cancelAnimationFrame(frameRef.current);
    landmarkerRef.current?.close?.(); landmarkerRef.current = null;
    if (ownsStreamRef.current) streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null; ownsStreamRef.current = false;
    if (videoRef.current) { videoRef.current.pause(); videoRef.current.srcObject = null; }
    drawSkeleton(canvasRef.current, null, false);
  }, []);

  const stopScan = useCallback(() => {
    releaseSensor(); setScanning(false); setLoading(false); setStatus(['摄像头未开启', 'Camera off']);
    setMessage(['手势扫描已关闭。摄像头画面从未显示、录制或上传。', 'Gesture scanner off. Camera frames stay on this device.']);
  }, [releaseSensor]);

  useEffect(() => releaseSensor, [releaseSensor]);

  useEffect(() => {
    if (unlockPhase === 'challenge') return;

    const timer = unlockPhase === 'animation' ? window.setTimeout(() => {
      setUnlockPhase('success');
      setMessage(['成功偷取宝藏，请逃离博物馆！', 'Treasure secured. Escape the museum!']);
    }, 2150) : window.setTimeout(onComplete, 1500);

    return () => window.clearTimeout(timer);
  }, [unlockPhase, onComplete]);

  const startScan = useCallback(async () => {
    if (loading || scanning) return;
    setLoading(true); setStatus(['正在连接摄像头…', 'Connecting to camera…']); setMessage(['正在加载本地手势识别模型，首次使用可能需要片刻。', 'Loading the local gesture model. This may take a moment on first use.']);
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera access is unavailable in this browser.');
      const stream = cameraStream ?? await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
      ownsStreamRef.current = !cameraStream;
      streamRef.current = stream;
      videoRef.current.srcObject = stream; await videoRef.current.play();
      const mediapipe = await import(MEDIAPIPE_MODULE);
      const vision = await mediapipe.FilesetResolver.forVisionTasks(WASM_ROOT);
      const options = { baseOptions: { modelAssetPath: HAND_MODEL_URL, delegate: 'GPU' }, runningMode: 'VIDEO', numHands: 1, minHandDetectionConfidence: .5, minHandPresenceConfidence: .5, minTrackingConfidence: .5 };
      try { landmarkerRef.current = await mediapipe.HandLandmarker.createFromOptions(vision, options); }
      catch { landmarkerRef.current = await mediapipe.HandLandmarker.createFromOptions(vision, { ...options, baseOptions: { modelAssetPath: HAND_MODEL_URL, delegate: 'CPU' } }); }
      lastVideoTimeRef.current = -1; lastInferenceRef.current = 0; gestureRef.current = GESTURES.NONE; completedRef.current = false;
      setScanning(true); setStatus(cameraStream ? ['正在使用上方已开启的摄像头', 'Using the gallery camera'] : ['本地识别已开启', 'Local gesture detection on']);
      setMessage(['摄像头画面不会显示；请在镜头前完成第一个食指手势。', 'Hold up your index finger in front of the camera.']);
    } catch (error) {
      releaseSensor(); setStatus(['开启失败', 'Could not start']);
      setMessage(['无法开启手势扫描，请检查摄像头权限和网络。', 'Could not start the scanner. Check camera permissions and network access.']);
      console.error(error);
    } finally { setLoading(false); }
  }, [cameraStream, loading, releaseSensor, scanning]);

  useEffect(() => {
    if (!scanning) return undefined;
    const infer = (now) => {
      const video = videoRef.current;
      if (video?.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.currentTime !== lastVideoTimeRef.current && now - lastInferenceRef.current > 55) {
        lastVideoTimeRef.current = video.currentTime; lastInferenceRef.current = now;
        try {
          const landmarks = landmarkerRef.current?.detectForVideo(video, now)?.landmarks?.[0] ?? null;
          const result = landmarks ? analyzeHand(landmarks) : null;
          gestureRef.current = result?.gesture ?? GESTURES.NONE; angleRef.current = result?.angle ?? null;
          if (landmarks) lastSeenRef.current = now;
          const machineSnapshot = machineRef.current.update({ gesture: gestureRef.current, angle: angleRef.current, now });
          const expected = machineSnapshot.stepIndex === 3 ? GESTURES.FIST : STEPS[Math.min(machineSnapshot.stepIndex, 3)].id;
          drawSkeleton(canvasRef.current, landmarks, gestureRef.current === expected && !machineSnapshot.unlocked);
          setLastGesture(gestureRef.current); setSnapshot(machineSnapshot);
          if (machineSnapshot.unlocked && !completedRef.current) {
            completedRef.current = true;
            releaseSensor();
            setScanning(false);
            setStatus(['宝箱已解锁', 'Chest unlocked']);
            setMessage(['四个手势已完成，正在开启宝箱…', 'Gestures complete. Opening the chest…']);
            setUnlockPhase('animation');
            return;
          }
        } catch { gestureRef.current = GESTURES.NONE; drawSkeleton(canvasRef.current, null, false); }
      }
      frameRef.current = requestAnimationFrame(infer);
    };
    frameRef.current = requestAnimationFrame(infer);
    return () => cancelAnimationFrame(frameRef.current);
  }, [releaseSensor, scanning]);

  const reset = () => {
    if (unlockPhase !== 'challenge') return;
    machineRef.current.reset(); setSnapshot(machineRef.current.snapshot()); gestureRef.current = GESTURES.NONE; setLastGesture(GESTURES.NONE); setMessage(scanning ? ['请从第一个手势开始解锁。', 'Start again from the first gesture.'] : ['开启扫描后，依次完成四个手势。', 'Start the scanner and complete the four gestures in order.']);
  };
  const current = Math.min(snapshot.stepIndex, 3);
  const step = STEPS[current];
  const hasRecentHand = scanning && performance.now() - lastSeenRef.current < 500;
  const expected = current === 3 ? GESTURES.FIST : step.id;
  const matching = hasRecentHand && lastGesture === expected && !snapshot.unlocked;
  const holdLabel = current < 3 && !snapshot.unlocked ? t(`保持进度 ${(snapshot.progress * 2).toFixed(1)} / 2.0 秒`, `Hold ${(snapshot.progress * 2).toFixed(1)} / 2.0 s`) : snapshot.unlocked ? t('解锁完成', 'Unlock complete') : t(`旋转进度 ${snapshot.rotationDegrees}° / 50°`, `Rotation ${snapshot.rotationDegrees}° / 50°`);

  return <main className="unlock-app" aria-label={t('宝箱手势解锁', 'Gesture chest unlock')}>
    <section className="unlock-stage" aria-label={t('四步手势解锁界面', 'Four-step gesture lock')}>
      <img className="unlock-static-shell" src={`${ASSET_ROOT}/ui_static_shell.png`} alt="" />
      <div className="unlock-top-cards" aria-label={t('解锁步骤', 'Unlock steps')}>{CARD_ASSETS.map((asset, index) => {
        const state = snapshot.unlocked || index < snapshot.stepIndex ? 'completed' : (scanning || snapshot.stepIndex > 0) && index === current ? 'selected' : 'idle';
        return <div className={`unlock-gesture-card ${state}`} style={{ left: `${CARD_LEFTS[index]}%` }} key={asset}>
          <img src={cardAsset(asset, state)} alt={t(`第 ${index + 1} 步手势`, `Gesture ${index + 1}`)} /><img className="unlock-selection-frame" src={`${ASSET_ROOT}/gesture_selection_frame.png`} alt="" /><img className="unlock-completed-check" src={`${ASSET_ROOT}/gesture_completed_check.png`} alt={t('完成', 'Complete')} />
        </div>;
      })}</div>
      <section className={`unlock-feedback ${matching || snapshot.unlocked ? 'matching' : ''}`} aria-label={t('实时手势识别反馈', 'Live gesture feedback')}>
        <canvas className="unlock-hand-skeleton" ref={canvasRef} width="640" height="480" aria-label={t('实时手势骨架', 'Live hand landmarks')} />
        <img className="unlock-feedback-check" src={`${ASSET_ROOT}/recognition_check_green.png`} alt="" />
        <div className="unlock-feedback-copy"><span>{snapshot.unlocked ? t('解锁完成', 'Unlock complete') : matching ? t('目标手势匹配', 'Gesture matched') : scanning ? t('实时手势识别', 'Live gesture detection') : t('识别待机', 'Scanner idle')}</span><strong>{snapshot.unlocked ? t('宝箱已开启', 'Chest open') : scanning ? t(...labels[lastGesture]) : t('等待开启扫描', 'Start the scanner')}</strong><small>{snapshot.unlocked ? t('四个目标手势已完成', 'All four gestures complete') : matching ? current < 3 ? t('保持当前动作满 2 秒', 'Hold for 2 seconds') : t('保持握拳并旋转手腕', 'Keep your fist closed and rotate') : scanning ? t('将一只手置于摄像头前', 'Hold one hand in front of the camera') : t('点击下方按钮开始本地手势识别', 'Enable the scanner to start')}</small></div>
        <div className="unlock-hold-progress"><span>{holdLabel}</span><div><i style={{ transform: `scaleX(${snapshot.progress})` }} /></div></div>
      </section>
      <section className={`unlock-dial ${matching || (current === 3 && snapshot.progress > 0) ? 'active' : ''} ${current === 3 && !snapshot.unlocked ? 'rotating' : ''}`} aria-label={t('解锁转盘', 'Combination dial')}>
        <img className="unlock-dial-rotor" style={{ transform: `rotate(${current === 3 ? Math.min(snapshot.rotationDegrees, 75) : Math.min(18, (current + snapshot.progress) * 6)}deg)` }} src={`${ASSET_ROOT}/dial_rotor.png`} alt={t('解锁转盘', 'Combination dial')} />
        <img className="unlock-dial-hub" src={`${ASSET_ROOT}/dial_hub_keyhole.png`} alt={t('钥匙孔', 'Keyhole')} /><img className="unlock-dial-pointer" src={`${ASSET_ROOT}/dial_pointer.png`} alt="" /><img className="unlock-dial-cue" src={`${ASSET_ROOT}/rotation_arrow_clockwise.png`} alt={t('顺时针旋转示意', 'Clockwise rotation guide')} />
      </section>
      <section className={`unlock-instruction ${current === 3 && !snapshot.unlocked ? 'rotate' : ''}`} aria-label={t('当前目标手势', 'Target gesture')}>
        <img className="unlock-target-icon" src={`${ASSET_ROOT}/${TARGET_ASSETS[current]}`} alt={t(...step.title)} /><img className="unlock-target-rotate" src={`${ASSET_ROOT}/target_pinch_and_rotate.png`} alt="" /><img className="unlock-rotation-arrow" src={`${ASSET_ROOT}/rotation_arrow_clockwise.png`} alt={t('顺时针旋转', 'Clockwise rotation')} />
        <div className="unlock-instruction-copy"><span>{t('当前目标', 'Target gesture')}</span><strong>{snapshot.unlocked ? t('宝箱已解锁', 'Chest unlocked') : t(...step.title)}</strong><small>{snapshot.unlocked ? t('四个手势序列已完成', 'All four gestures complete') : t(...step.detail)}</small></div>
      </section>
      <section className="unlock-progress-track" aria-label={t('解锁进度', 'Unlock progress')}><div className="unlock-progress-fill-mask"><img style={{ transform: `scaleX(${snapshot.unlocked ? 1 : (snapshot.stepIndex + snapshot.progress) / STEPS.length})` }} src={`${ASSET_ROOT}/progress_fill_gold.png`} alt="" /></div><div className="unlock-progress-nodes">{CARD_ASSETS.map((asset, index) => { const state = snapshot.unlocked || index < snapshot.stepIndex ? 'completed' : (scanning || snapshot.stepIndex > 0) && index === current ? 'selected' : 'idle'; return <img className={state} style={{ left: `${NODE_LEFTS[index]}%` }} src={`${ASSET_ROOT}/progress_token_${state}.png`} alt={t(`第 ${index + 1} 步进度`, `Step ${index + 1} progress`)} key={asset} />; })}</div></section>
      {unlockPhase === 'challenge' && <div className="unlock-stage-controls"><button type="button" className={`unlock-scan-toggle ${scanning ? 'scanning' : ''}`} onClick={scanning ? stopScan : startScan} disabled={loading}>{scanning ? t('关闭手势扫描', 'Stop scanner') : loading ? t('正在开启…', 'Starting…') : t('开启手势扫描', 'Start scanner')}</button><button type="button" className="unlock-reset-toggle" onClick={reset}>{t('重置', 'Reset')}</button><button type="button" className="unlock-exit-toggle" onClick={onExit}>{t('返回展厅', 'Back to gallery')}</button><span>{t(...status)}</span></div>}
      <div className={`unlock-message ${snapshot.unlocked ? 'success' : ''}`} role="status">{t(...message)}</div><video ref={videoRef} className="unlock-sensor-video" autoPlay muted playsInline aria-hidden="true" />
      {unlockPhase !== 'challenge' && <ChestUnlockSequence phase={unlockPhase} />}
    </section>
    <p className="unlock-privacy-note">{t('手势仅在本机浏览器中分析；界面不会显示、录制或上传摄像头画面。', 'Gesture detection runs locally. Camera frames stay on this device.')}</p>
  </main>;
}

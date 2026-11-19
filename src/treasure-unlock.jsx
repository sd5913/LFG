import { useCallback, useEffect, useRef, useState } from 'react';
import { analyzeHand, GESTURES, HAND_EDGES } from './hand-gestures.js';
import { STEPS, UnlockMachine } from './unlock-machine.js';

const TASKS_VERSION = '0.10.14';
const MEDIAPIPE_MODULE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VERSION}`;
const WASM_ROOT = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VERSION}/wasm`;
const HAND_MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const ASSET_ROOT = '/unlock-ui';
const CARD_ASSETS = ['gesture_step_01_index', 'gesture_step_02_pinch', 'gesture_step_03_fist', 'gesture_step_04_side_fist'];
const TARGET_ASSETS = ['gesture_index_gold.png', 'gesture_pinch_gold.png', 'gesture_fist_gold.png', 'gesture_side_fist_gold.png'];
const CARD_LEFTS = [20.82, 38.3, 55.3, 70.92];
const NODE_LEFTS = [0, 25.5, 51, 76.5];
const labels = { NONE: '未检测到手', UNKNOWN: '正在识别手势', OPEN: '张开手掌', POINT: '食指手势', PINCH: '捏合手势', FIST: '握拳手势' };

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

function ChestUnlockSequence({ phase, onComplete }) {
  return <section className={`unlock-chest-sequence ${phase}`} aria-live="polite" aria-label={phase === 'animation' ? '宝箱开启中' : '偷取宝藏成功'}>
    <span className="unlock-alert-paused">警戒已暂停</span>
    <div className="unlock-chest-animation" aria-hidden="true">
      <img className="unlock-chest-closed" src="/unlock-animation/chest_closed.png" alt="" />
      <img className="unlock-chest-open" src="/unlock-animation/chest_open.png" alt="" />
      <div className="unlock-chest-lid"><img src="/unlock-animation/chest_closed.png" alt="" /></div>
      <div className="unlock-chest-dial">
        <img className="unlock-chest-rotor" src="/unlock-animation/dial_rotor.png" alt="" />
        <img className="unlock-chest-hub" src="/unlock-animation/dial_hub.png" alt="" />
        <img className="unlock-chest-pointer" src="/unlock-animation/dial_pointer.png" alt="" />
      </div>
    </div>
    {phase === 'success' && <section className="unlock-success-card" role="status">
      <span>MISSION COMPLETE</span>
      <strong>成功偷取宝藏</strong>
      <p>宝藏已收入囊中，请逃离博物馆！</p>
      <button type="button" onClick={onComplete}>返回展厅，开始逃离</button>
    </section>}
  </section>;
}

export function TreasureUnlock({ cameraStream, onComplete, onExit }) {
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
  const completionTimerRef = useRef(0);
  const [scanning, setScanning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [unlockPhase, setUnlockPhase] = useState('challenge');
  const [status, setStatus] = useState('摄像头未开启');
  const [message, setMessage] = useState('开启扫描后，依次完成四个手势。');
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
    releaseSensor(); setScanning(false); setLoading(false); setStatus('摄像头未开启');
    setMessage('手势扫描已关闭。摄像头画面从未显示、录制或上传。');
  }, [releaseSensor]);

  useEffect(() => () => {
    window.clearTimeout(completionTimerRef.current);
    releaseSensor();
  }, [releaseSensor]);

  const startScan = useCallback(async () => {
    if (loading || scanning) return;
    setLoading(true); setStatus('正在连接摄像头…'); setMessage('正在加载本地手势识别模型，首次使用可能需要片刻。');
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('当前浏览器不支持摄像头。');
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
      setScanning(true); setStatus(cameraStream ? '正在使用上方已开启的摄像头' : '本地识别已开启');
      setMessage('摄像头画面不会显示；请在镜头前完成第一个食指手势。');
    } catch (error) {
      releaseSensor(); setStatus('开启失败'); setMessage(`无法开启手势扫描：${error?.message || String(error)}`);
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
            setStatus('宝箱已解锁');
            setMessage('四个手势已完成，正在开启宝箱…');
            setUnlockPhase('animation');
            completionTimerRef.current = window.setTimeout(() => {
              setUnlockPhase('success');
              setMessage('成功偷取宝藏，请逃离博物馆！');
            }, 2150);
            return;
          }
        } catch { gestureRef.current = GESTURES.NONE; drawSkeleton(canvasRef.current, null, false); }
      }
      frameRef.current = requestAnimationFrame(infer);
    };
    frameRef.current = requestAnimationFrame(infer);
    return () => cancelAnimationFrame(frameRef.current);
  }, [onComplete, releaseSensor, scanning]);

  const reset = () => {
    if (unlockPhase !== 'challenge') return;
    machineRef.current.reset(); setSnapshot(machineRef.current.snapshot()); gestureRef.current = GESTURES.NONE; setLastGesture(GESTURES.NONE); setMessage(scanning ? '请从第一个手势开始解锁。' : '开启扫描后，依次完成四个手势。');
  };
  const current = Math.min(snapshot.stepIndex, 3);
  const step = STEPS[current];
  const hasRecentHand = scanning && performance.now() - lastSeenRef.current < 500;
  const expected = current === 3 ? GESTURES.FIST : step.id;
  const matching = hasRecentHand && lastGesture === expected && !snapshot.unlocked;
  const holdLabel = current < 3 && !snapshot.unlocked ? `保持进度 ${(snapshot.progress * 2).toFixed(1)} / 2.0 秒` : snapshot.unlocked ? '解锁完成' : `旋转进度 ${snapshot.rotationDegrees}° / 50°`;

  return <main className="unlock-app" aria-label="宝箱手势解锁">
    <section className="unlock-stage" aria-label="四步手势解锁界面">
      <img className="unlock-static-shell" src={`${ASSET_ROOT}/ui_static_shell.png`} alt="" />
      <div className="unlock-top-cards" aria-label="解锁步骤">{CARD_ASSETS.map((asset, index) => {
        const state = snapshot.unlocked || index < snapshot.stepIndex ? 'completed' : (scanning || snapshot.stepIndex > 0) && index === current ? 'selected' : 'idle';
        return <div className={`unlock-gesture-card ${state}`} style={{ left: `${CARD_LEFTS[index]}%` }} key={asset}>
          <img src={cardAsset(asset, state)} alt={`第 ${index + 1} 步手势`} /><img className="unlock-selection-frame" src={`${ASSET_ROOT}/gesture_selection_frame.png`} alt="" /><img className="unlock-completed-check" src={`${ASSET_ROOT}/gesture_completed_check.png`} alt="完成" />
        </div>;
      })}</div>
      <section className={`unlock-feedback ${matching || snapshot.unlocked ? 'matching' : ''}`} aria-label="实时手势识别反馈">
        <canvas className="unlock-hand-skeleton" ref={canvasRef} width="640" height="480" aria-label="实时手势骨架" />
        <img className="unlock-feedback-check" src={`${ASSET_ROOT}/recognition_check_green.png`} alt="" />
        <div className="unlock-feedback-copy"><span>{snapshot.unlocked ? '解锁完成' : matching ? '目标手势匹配' : scanning ? '实时手势识别' : '识别待机'}</span><strong>{snapshot.unlocked ? '宝箱已开启' : scanning ? labels[lastGesture] : '等待开启扫描'}</strong><small>{snapshot.unlocked ? '四个目标手势已完成' : matching ? current < 3 ? '保持当前动作满 2 秒' : '保持握拳并旋转手腕' : scanning ? '将一只手置于摄像头前' : '点击下方按钮开始本地手势识别'}</small></div>
        <div className="unlock-hold-progress"><span>{holdLabel}</span><div><i style={{ transform: `scaleX(${snapshot.progress})` }} /></div></div>
      </section>
      <section className={`unlock-dial ${matching || (current === 3 && snapshot.progress > 0) ? 'active' : ''} ${current === 3 && !snapshot.unlocked ? 'rotating' : ''}`} aria-label="解锁转盘">
        <img className="unlock-dial-rotor" style={{ transform: `rotate(${current === 3 ? Math.min(snapshot.rotationDegrees, 75) : Math.min(18, (current + snapshot.progress) * 6)}deg)` }} src={`${ASSET_ROOT}/dial_rotor.png`} alt="解锁转盘" />
        <img className="unlock-dial-hub" src={`${ASSET_ROOT}/dial_hub_keyhole.png`} alt="钥匙孔" /><img className="unlock-dial-pointer" src={`${ASSET_ROOT}/dial_pointer.png`} alt="" /><img className="unlock-dial-cue" src={`${ASSET_ROOT}/rotation_arrow_clockwise.png`} alt="顺时针旋转示意" />
      </section>
      <section className={`unlock-instruction ${current === 3 && !snapshot.unlocked ? 'rotate' : ''}`} aria-label="当前目标手势">
        <img className="unlock-target-icon" src={`${ASSET_ROOT}/${TARGET_ASSETS[current]}`} alt={step.title} /><img className="unlock-target-rotate" src={`${ASSET_ROOT}/target_pinch_and_rotate.png`} alt="" /><img className="unlock-rotation-arrow" src={`${ASSET_ROOT}/rotation_arrow_clockwise.png`} alt="顺时针旋转" />
        <div className="unlock-instruction-copy"><span>当前目标</span><strong>{snapshot.unlocked ? '宝箱已解锁' : step.title}</strong><small>{snapshot.unlocked ? '四个手势序列已完成' : step.detail}</small></div>
      </section>
      <section className="unlock-progress-track" aria-label="解锁进度"><div className="unlock-progress-fill-mask"><img style={{ transform: `scaleX(${snapshot.unlocked ? 1 : (snapshot.stepIndex + snapshot.progress) / STEPS.length})` }} src={`${ASSET_ROOT}/progress_fill_gold.png`} alt="" /></div><div className="unlock-progress-nodes">{CARD_ASSETS.map((asset, index) => { const state = snapshot.unlocked || index < snapshot.stepIndex ? 'completed' : (scanning || snapshot.stepIndex > 0) && index === current ? 'selected' : 'idle'; return <img className={state} style={{ left: `${NODE_LEFTS[index]}%` }} src={`${ASSET_ROOT}/progress_token_${state}.png`} alt={`第 ${index + 1} 步进度`} key={asset} />; })}</div></section>
      {unlockPhase === 'challenge' && <div className="unlock-stage-controls"><button type="button" className={`unlock-scan-toggle ${scanning ? 'scanning' : ''}`} onClick={scanning ? stopScan : startScan} disabled={loading}>{scanning ? '关闭手势扫描' : loading ? '正在开启…' : '开启手势扫描'}</button><button type="button" className="unlock-reset-toggle" onClick={reset}>重置</button><button type="button" className="unlock-exit-toggle" onClick={onExit}>返回展厅</button><span>{status}</span></div>}
      <div className={`unlock-message ${snapshot.unlocked ? 'success' : ''}`} role="status">{message}</div><video ref={videoRef} className="unlock-sensor-video" autoPlay muted playsInline aria-hidden="true" />
      {unlockPhase !== 'challenge' && <ChestUnlockSequence phase={unlockPhase} onComplete={onComplete} />}
    </section>
    <p className="unlock-privacy-note">手势仅在本机浏览器中分析；界面不会显示、录制或上传摄像头画面。</p>
  </main>;
}

import { useCallback, useEffect, useRef, useState } from 'react';

const TASKS_VERSION = '0.10.14';
const WASM_ROOT = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VERSION}/wasm`;
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
const HOLD_DURATION_MS = 2000;
const JITTER_GRACE_MS = 220;
const ASSET_ROOT = '/stealth-ui';

const TARGET_ARM_CONFIGS = {
  'hands-at-heart': { upper: [0, 0.9], forearm: [-0.85, -0.2] },
  'holding-scroll': { upper: [0.05, 1], forearm: [-0.62, 0.38] },
  'hand-on-head': { upper: [0.55, -0.5], forearm: [-0.55, -0.8], required: ['rightElbow', 'rightWrist'] },
};

const TARGETS = [
  { id: 'hands-at-heart', title: '护心雕像', instruction: '双手护在胸前，保持不动' },
  { id: 'holding-scroll', title: '持卷轴雕像', instruction: '双手捧起卷轴，保持不动' },
  { id: 'hand-on-head', title: '抚额雕像', instruction: '抬起右手扶额，保持不动' },
];

function landmarkIsVisible(landmarks, index) {
  return landmarks[index] && (landmarks[index].visibility == null || landmarks[index].visibility > 0.45);
}

function getTargetGuide(width, height, target, landmarks) {
  const config = TARGET_ARM_CONFIGS[target.id];
  if (!config || !landmarks || ![0, 7, 8, 11, 12, 13, 14, 15, 16].every((index) => landmarkIsVisible(landmarks, index))) return null;
  const point = (index) => ({ x: (1 - landmarks[index].x) * width, y: landmarks[index].y * height });
  const points = { head: point(0), leftEar: point(7), rightEar: point(8), leftShoulder: point(11), rightShoulder: point(12) };
  if (landmarkIsVisible(landmarks, 23) && landmarkIsVisible(landmarks, 24)) { points.leftHip = point(23); points.rightHip = point(24); }
  const center = { x: (points.leftShoulder.x + points.rightShoulder.x) / 2, y: (points.leftShoulder.y + points.rightShoulder.y) / 2 };
  const shoulderWidth = Math.hypot(points.rightShoulder.x - points.leftShoulder.x, points.rightShoulder.y - points.leftShoulder.y);
  const measuredUpper = (Math.hypot(points.leftShoulder.x - point(13).x, points.leftShoulder.y - point(13).y) + Math.hypot(points.rightShoulder.x - point(14).x, points.rightShoulder.y - point(14).y)) / 2;
  const measuredFore = (Math.hypot(point(13).x - point(15).x, point(13).y - point(15).y) + Math.hypot(point(14).x - point(16).x, point(14).y - point(16).y)) / 2;
  const upperLength = Math.min(Math.max(measuredUpper, shoulderWidth * 0.42), shoulderWidth * 0.68);
  const foreLength = Math.min(Math.max(measuredFore, shoulderWidth * 0.42), shoulderWidth * 0.68);
  const upperSide = target.id === 'hands-at-heart' ? Math.min(0.58, Math.max(0.42, (shoulderWidth / upperLength) * 0.24)) : config.upper[0];
  const unit = ([x, y]) => { const length = Math.hypot(x, y); return { x: x / length, y: y / length }; };
  const createArm = (shoulder, side) => {
    const upper = unit([side * upperSide, config.upper[1]]);
    const elbow = { x: shoulder.x + upper.x * upperLength, y: shoulder.y + upper.y * upperLength };
    const fore = unit([side * config.forearm[0], config.forearm[1]]);
    return { elbow, wrist: { x: elbow.x + fore.x * foreLength, y: elbow.y + fore.y * foreLength } };
  };
  const leftArm = config.required ? { elbow: point(13), wrist: point(15) } : createArm(points.leftShoulder, Math.sign(points.leftShoulder.x - center.x) || -1);
  const rightArm = createArm(points.rightShoulder, Math.sign(points.rightShoulder.x - center.x) || 1);
  Object.assign(points, { leftElbow: leftArm.elbow, leftWrist: leftArm.wrist, rightElbow: rightArm.elbow, rightWrist: rightArm.wrist });
  const indexes = { leftElbow: 13, leftWrist: 15, rightElbow: 14, rightWrist: 16 };
  const matchRadius = Math.max(28, shoulderWidth * 0.46);
  const required = config.required ?? Object.keys(indexes);
  const matchedPoints = Object.fromEntries(required.map((name) => [name, Math.hypot(point(indexes[name]).x - points[name].x, point(indexes[name]).y - points[name].y) < matchRadius]));
  return { points, matchedPoints, isMatched: Object.values(matchedPoints).every(Boolean) };
}

function drawGuide(context, width, target, guide) {
  if (!guide) return;
  const { points } = guide;
  const connections = [['head', 'leftEar'], ['head', 'rightEar'], ['leftEar', 'leftShoulder'], ['rightEar', 'rightShoulder'], ['leftShoulder', 'rightShoulder'], ['leftShoulder', 'leftElbow'], ['leftElbow', 'leftWrist'], ['rightShoulder', 'rightElbow'], ['rightElbow', 'rightWrist'], ['leftShoulder', 'leftHip'], ['rightShoulder', 'rightHip'], ['leftHip', 'rightHip']];
  context.save();
  context.strokeStyle = 'rgba(132, 196, 217, .52)';
  context.lineWidth = Math.max(10, width * 0.018);
  context.lineCap = 'square';
  context.setLineDash([12, 12]);
  context.beginPath();
  connections.forEach(([from, to]) => { if (points[from] && points[to]) { context.moveTo(points[from].x, points[from].y); context.lineTo(points[to].x, points[to].y); } });
  context.stroke();
  context.setLineDash([]);
  Object.values(points).filter(Boolean).forEach(({ x, y }) => { context.fillStyle = 'rgba(146, 185, 179, .58)'; context.fillRect(x - width * 0.016, y - width * 0.016, width * 0.032, width * 0.032); });
  context.restore();
}

function drawStaticGhost(context, width, height, target) {
  const config = TARGET_ARM_CONFIGS[target.id];
  const shoulderY = height * 0.44;
  const shoulders = [{ x: width * 0.39, y: shoulderY }, { x: width * 0.61, y: shoulderY }];
  const upperLength = width * 0.15;
  const foreLength = width * 0.15;
  const upperSide = target.id === 'hands-at-heart' ? 0.46 : config.upper[0];
  const unit = ([x, y]) => { const length = Math.hypot(x, y); return { x: x / length, y: y / length }; };
  const arm = (shoulder, side) => {
    const upper = unit([side * upperSide, config.upper[1]]);
    const elbow = { x: shoulder.x + upper.x * upperLength, y: shoulder.y + upper.y * upperLength };
    const fore = unit([side * config.forearm[0], config.forearm[1]]);
    return { elbow, wrist: { x: elbow.x + fore.x * foreLength, y: elbow.y + fore.y * foreLength } };
  };
  const left = arm(shoulders[0], -1); const right = arm(shoulders[1], 1);
  const points = { head: { x: width / 2, y: height * 0.23 }, leftEar: { x: width * 0.47, y: height * 0.25 }, rightEar: { x: width * 0.53, y: height * 0.25 }, leftShoulder: shoulders[0], rightShoulder: shoulders[1], leftElbow: left.elbow, leftWrist: left.wrist, rightElbow: right.elbow, rightWrist: right.wrist, leftHip: { x: width * 0.44, y: height * 0.72 }, rightHip: { x: width * 0.56, y: height * 0.72 } };
  drawGuide(context, width, target, { points, matchedPoints: {} });
}

function drawMatchedHighlights(context, width, guide) {
  if (!guide) return;
  context.save();
  Object.entries(guide.matchedPoints).forEach(([name, isMatched]) => {
    if (!isMatched) return;
    const { x, y } = guide.points[name];
    const size = width * 0.048;
    context.shadowColor = '#ffffff'; context.shadowBlur = 22; context.fillStyle = '#ffffff';
    context.fillRect(x - size / 2, y - size / 2, size, size);
  });
  context.restore();
}

function drawPose(canvas, landmarks, isMatching, target, guide) {
  const context = canvas.getContext('2d');
  const { width, height } = canvas;
  context.clearRect(0, 0, width, height);
  if (!landmarks) { drawStaticGhost(context, width, height, target); return; }

  drawGuide(context, width, target, guide);

  const point = (index) => ({ x: (1 - landmarks[index].x) * width, y: landmarks[index].y * height });
  const usable = (index) => landmarkIsVisible(landmarks, index);
  const connections = [[0, 11], [0, 12], [11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24]];
  const bodyColor = isMatching ? '#9fbeae' : '#91a8a1';
  const glow = isMatching ? '#8de0bd' : '#d7b86e';

  context.save();
  context.lineCap = 'square';
  context.lineJoin = 'bevel';
  context.strokeStyle = bodyColor;
  context.lineWidth = Math.max(18, width * 0.045);
  context.beginPath();
  connections.forEach(([from, to]) => {
    if (!usable(from) || !usable(to)) return;
    const a = point(from); const b = point(to);
    context.moveTo(a.x, a.y); context.lineTo(b.x, b.y);
  });
  context.stroke();
  [0, 11, 12, 13, 14, 23, 24].forEach((index) => {
    if (!usable(index)) return;
    const p = point(index);
    context.fillStyle = bodyColor;
    context.fillRect(p.x - width * 0.03, p.y - width * 0.03, width * 0.06, width * 0.06);
  });
  [11, 12, 15, 16].forEach((index) => {
    if (!usable(index)) return;
    const p = point(index);
    context.shadowColor = glow;
    context.shadowBlur = isMatching ? 20 : 7;
    context.fillStyle = glow;
    context.fillRect(p.x - width * 0.022, p.y - width * 0.022, width * 0.044, width * 0.044);
  });
  drawMatchedHighlights(context, width, guide);
  context.restore();
}

function asset(name) { return `${ASSET_ROOT}/${name}`; }

export function PoseShadowDemo() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const landmarkerRef = useRef(null);
  const animationFrameRef = useRef(0);
  const lastVideoTimeRef = useRef(-1);
  const holdStartedAtRef = useRef(null);
  const lastMatchedAtRef = useRef(0);
  const lastProgressRef = useRef(0);
  const targetIndexRef = useRef(0);
  const actionStartedAtRef = useRef(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isMatching, setIsMatching] = useState(false);
  const [holdProgress, setHoldProgress] = useState(0);
  const [targetIndex, setTargetIndex] = useState(0);
  const [completedTasks, setCompletedTasks] = useState(0);
  const [alarm, setAlarm] = useState(40);
  const [status, setStatus] = useState('准备开始扫描');
  const [error, setError] = useState('');
  const [scanSeconds, setScanSeconds] = useState(10);

  const stopCamera = useCallback(() => {
    cancelAnimationFrame(animationFrameRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    if (canvasRef.current) drawPose(canvasRef.current, null, false, TARGETS[targetIndexRef.current]);
    holdStartedAtRef.current = null;
    lastMatchedAtRef.current = 0;
    lastProgressRef.current = 0;
    actionStartedAtRef.current = null;
    setHoldProgress(0); setIsMatching(false); setIsRunning(false); setStatus('扫描已暂停');
    setScanSeconds(10);
  }, []);

  const detectFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const landmarker = landmarkerRef.current;
    if (!video || !canvas || !landmarker || !streamRef.current) return;
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.currentTime !== lastVideoTimeRef.current) {
      lastVideoTimeRef.current = video.currentTime;
      const landmarks = landmarker.detectForVideo(video, performance.now()).landmarks[0];
      const target = TARGETS[targetIndexRef.current];
      const guide = getTargetGuide(canvas.width, canvas.height, target, landmarks);
      const matching = Boolean(guide?.isMatched);
      drawPose(canvas, landmarks, matching, target, guide);
      setIsMatching(matching);
      const now = performance.now();
      actionStartedAtRef.current ??= now;
      const elapsed = now - actionStartedAtRef.current;
      const nextSecond = Math.max(0, Math.ceil((10000 - elapsed) / 1000));
      setScanSeconds((current) => current === nextSecond ? current : nextSecond);
      if (elapsed >= 10000) {
        actionStartedAtRef.current = now;
        holdStartedAtRef.current = null;
        lastProgressRef.current = 0;
        setHoldProgress(0);
        setScanSeconds(10);
        setAlarm((value) => Math.min(100, value + 10));
        setStatus('扫描超时，警戒上升；请重新伪装');
        animationFrameRef.current = requestAnimationFrame(detectFrame);
        return;
      }
      if (matching) {
        lastMatchedAtRef.current = now;
        holdStartedAtRef.current ??= now;
        const progress = Math.min(100, ((now - holdStartedAtRef.current) / HOLD_DURATION_MS) * 100);
        if (Math.abs(lastProgressRef.current - progress) > 0.8) { lastProgressRef.current = progress; setHoldProgress(progress); }
        setStatus('姿势正确，继续保持');
        if (progress >= 100) {
          holdStartedAtRef.current = null; lastProgressRef.current = 0; setHoldProgress(0);
          const nextIndex = (targetIndexRef.current + 1) % TARGETS.length;
          targetIndexRef.current = nextIndex;
          actionStartedAtRef.current = now;
          setScanSeconds(10);
          setTargetIndex(nextIndex);
          setCompletedTasks((value) => value + 1);
          setAlarm((value) => Math.max(0, value - 10));
          setStatus('伪装成功！下一项姿势任务已开始。');
        }
      } else {
        const withinGrace = holdStartedAtRef.current && now - lastMatchedAtRef.current < JITTER_GRACE_MS;
        if (withinGrace) {
          setStatus('正在容忍短暂识别抖动，请保持姿势');
        } else {
          holdStartedAtRef.current = null;
          if (lastProgressRef.current) setHoldProgress(0);
          lastProgressRef.current = 0;
          setStatus(landmarks ? `模仿目标姿势：${target.title}` : '请站到扫描窗口中央');
        }
      }
    }
    animationFrameRef.current = requestAnimationFrame(detectFrame);
  }, []);

  const startCamera = useCallback(async () => {
    setError(''); setStatus('正在连接扫描器…');
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('当前浏览器不支持摄像头访问。');
      const [{ FilesetResolver, PoseLandmarker }, stream] = await Promise.all([
        import(`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VERSION}`),
        navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 1280, height: 720 }, audio: false }),
      ]);
      const vision = await FilesetResolver.forVisionTasks(WASM_ROOT);
      if (!landmarkerRef.current) {
        const options = { baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' }, runningMode: 'VIDEO', numPoses: 1, minPoseDetectionConfidence: 0.55, minPosePresenceConfidence: 0.55, minTrackingConfidence: 0.5 };
        try { landmarkerRef.current = await PoseLandmarker.createFromOptions(vision, options); }
        catch { landmarkerRef.current = await PoseLandmarker.createFromOptions(vision, { ...options, baseOptions: { modelAssetPath: MODEL_URL, delegate: 'CPU' } }); }
      }
      streamRef.current = stream; videoRef.current.srcObject = stream;
      await videoRef.current.play();
      actionStartedAtRef.current = performance.now();
      setScanSeconds(10);
      setIsRunning(true); setStatus(`扫描灯靠近 · 模仿${TARGETS[targetIndexRef.current].title}`);
      animationFrameRef.current = requestAnimationFrame(detectFrame);
    } catch (caughtError) {
      streamRef.current?.getTracks().forEach((track) => track.stop()); streamRef.current = null;
      setError(caughtError.message || '无法启动摄像头。'); setStatus('扫描器连接失败');
    }
  }, [detectFrame]);

  useEffect(() => () => { cancelAnimationFrame(animationFrameRef.current); streamRef.current?.getTracks().forEach((track) => track.stop()); landmarkerRef.current?.close(); }, []);
  useEffect(() => {
    if (!isRunning && canvasRef.current) drawPose(canvasRef.current, null, false, TARGETS[targetIndex]);
  }, [isRunning, targetIndex]);

  const target = TARGETS[targetIndex];

  return (
    <main className="stealth-shell">
      <section className="stealth-game" aria-label="博物馆姿势扫描挑战">
        <img className="museum-backplate" src={asset('museum_scene_backplate.png')} alt="" />
        <div className="scene-dim" />

        <header className="top-hud">
          <img src={asset('top_hud_background.png')} alt="" />
          <div className="alarm-readout">
            <img className="alarm-siren" src={asset('alarm_siren.png')} alt="" />
            <span className="alarm-copy">警戒<strong>{alarm}%</strong></span>
            <div className="alarm-meter" aria-label={`警戒 ${alarm}%`}>
              <img src={asset('alarm_meter_frame.png')} alt="" />
              <img className="meter-fill" style={{ clipPath: `inset(0 ${100 - alarm}% 0 0)` }} src={asset('alarm_meter_fill_segments.png')} alt="" />
            </div>
          </div>
          <div className="route-readout" aria-label="潜入路线">
            <img src={asset('room_house.png')} alt="起点房间" />
            <i /><img className="route-player" src={asset('player_marker.png')} alt="当前位置" />
            <i /><img src={asset('room_house.png')} alt="下一个房间" />
            <i /><img className="treasure" src={asset('treasure_chest.png')} alt="宝箱" />
          </div>
        </header>

        <section className="challenge-layer">
          <div className="warning-banner">
            <img src={asset('warning_banner_blank.png')} alt="" />
            <div className="warning-copy"><strong>扫描灯靠近 · 伪装成雕像</strong><span aria-label={`剩余 ${scanSeconds} 秒`}>{String(scanSeconds).padStart(2, '0')} 秒</span></div>
          </div>

          <section className="pose-screen">
            <img src={asset('pose_screen_panel.png')} alt="" />
            <p className="target-step">目标动作 {String(targetIndex + 1).padStart(2, '0')} / {String(TARGETS.length).padStart(2, '0')} · {target.title}</p>
            <canvas ref={canvasRef} width="1124" height="596" aria-label="目标姿势虚影与实时关节点识别" />
            <div className="pose-progress" aria-label={`姿势匹配进度 ${Math.round(holdProgress)}%`}>
              <span>姿势匹配进度</span>
              <div className="pose-meter"><img src={asset('pose_progress_frame.png')} alt="" /><img className="meter-fill" style={{ clipPath: `inset(0 ${100 - holdProgress}% 0 0)` }} src={asset('pose_progress_fill_segments.png')} alt="" /></div>
              <strong>{Math.round(holdProgress)}%</strong>
            </div>
            {!isRunning && <p className="scan-hint">启动扫描后，虚影会贴合你的站位</p>}
          </section>

          <footer className="result-banner">
            <img src={asset('result_banner_blank.png')} alt="" />
            <div className="result-copy"><span>成功：获得安全窗口</span><button type="button" onClick={isRunning ? stopCamera : startCamera}>{isRunning ? '暂停扫描' : '启动扫描'}</button><em>失败：警戒上升</em></div>
          </footer>
          {error && <p className="error-message">{error}</p>}
        </section>
        <video ref={videoRef} muted playsInline />
      </section>
      <p className="privacy-note" aria-live="polite">{status} · 摄像头与关键点仅在本机浏览器内处理。</p>
    </main>
  );
}

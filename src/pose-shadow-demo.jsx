import { useCallback, useEffect, useRef, useState } from 'react';

const TASKS_VERSION = '0.10.14';
const WASM_ROOT = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VERSION}/wasm`;
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
const HOLD_DURATION_MS = 2000;
const JITTER_GRACE_MS = 220;
const ASSET_ROOT = '/stealth-ui';

// These guides and matching joints are authored from the four blue-frame
// display images, rather than sharing the earlier rotating demo targets.
const EXHIBIT_POSE_CONFIGS = Object.freeze({
  'case-nw': {
    title: '鸟首祈祷雕像', instruction: '双手在胸前交握，保持不动',
    referenceImage: '/assets/exhibits/case-nw-hidden.png',
    // Low, nearly central elbows make both palms meet at the sternum.
    left: { upper: [-0.18, 0.98], forearm: [0.94, -0.34] },
    right: { upper: [0.18, 0.98], forearm: [-0.94, -0.34] },
  },
  'case-sw': {
    title: '持卷轴雕像', instruction: '双手在胸前捧起卷轴，保持不动',
    referenceImage: '/assets/exhibits/case-sw-hidden.png',
    // Unlike the prayer pose, elbows open out and each hand stays on one side
    // of the imaginary scroll instead of meeting in the centre.
    left: { upper: [-0.8, 0.6], forearm: [1, -0.1] },
    right: { upper: [0.8, 0.6], forearm: [-1, -0.1] },
  },
  'case-ne': {
    title: '星月抚额雕像', instruction: '左手轻扶额角，右手自然收于腹前',
    referenceImage: '/assets/exhibits/case-ne-hidden.png',
    // The raised hand stops beside the forehead, never above the head.
    left: { upper: [-0.6, -0.42], forearm: [0.54, -0.84] },
    right: { upper: [0.5, 0.76], forearm: [-0.86, -0.18] },
    required: ['leftElbow', 'leftWrist'],
  },
  'case-se': {
    title: '宝石抱臂雕像', instruction: '左臂斜搭右肩，右手自然垂于腹前',
    referenceImage: '/assets/exhibits/case-se-hidden.png',
    // This statue has one arm across the chest and the other relaxed at the waist.
    left: { upper: [0.48, 0.64], forearm: [0.55, -0.78] },
    // Keep the resting hand visibly outside the crossed arm, avoiding overlap.
    right: { upper: [0.48, 0.8], forearm: [-0.25, 0.97] },
    required: ['leftElbow', 'leftWrist'],
    // A slightly wider tolerance retains the same compact shoulder-touching
    // gesture while accommodating ordinary elbow and wrist tracking jitter.
    matchRadius: 0.58,
  },
});

const TARGETS = Object.entries(EXHIBIT_POSE_CONFIGS)
  .map(([id, { title, instruction, referenceImage }]) => ({ id, title, instruction, referenceImage }));

function landmarkIsVisible(landmarks, index) {
  return landmarks[index] && (landmarks[index].visibility == null || landmarks[index].visibility > 0.45);
}

function getTargetGuide(width, height, target, landmarks) {
  const config = EXHIBIT_POSE_CONFIGS[target.id];
  if (!config || !landmarks || ![0, 7, 8, 11, 12, 13, 14, 15, 16].every((index) => landmarkIsVisible(landmarks, index))) return null;
  const point = (index) => ({ x: (1 - landmarks[index].x) * width, y: landmarks[index].y * height });
  const points = { head: point(0), leftEar: point(7), rightEar: point(8), leftShoulder: point(11), rightShoulder: point(12) };
  if (landmarkIsVisible(landmarks, 23) && landmarkIsVisible(landmarks, 24)) { points.leftHip = point(23); points.rightHip = point(24); }
  const shoulderWidth = Math.hypot(points.rightShoulder.x - points.leftShoulder.x, points.rightShoulder.y - points.leftShoulder.y);
  const measuredUpper = (Math.hypot(points.leftShoulder.x - point(13).x, points.leftShoulder.y - point(13).y) + Math.hypot(points.rightShoulder.x - point(14).x, points.rightShoulder.y - point(14).y)) / 2;
  const measuredFore = (Math.hypot(point(13).x - point(15).x, point(13).y - point(15).y) + Math.hypot(point(14).x - point(16).x, point(14).y - point(16).y)) / 2;
  // Keep the authored guide compact. A very tall person standing close to the
  // camera used to generate arms which ran outside the scan window.
  const upperLength = Math.min(Math.max(measuredUpper, shoulderWidth * 0.36), shoulderWidth * 0.5);
  const foreLength = Math.min(Math.max(measuredFore, shoulderWidth * 0.34), shoulderWidth * 0.48);
  const unit = ([x, y]) => { const length = Math.hypot(x, y); return { x: x / length, y: y / length }; };
  const shoulderMidY = (points.leftShoulder.y + points.rightShoulder.y) / 2;
  // The guide always remains from forehead to upper abdomen: this is the
  // reliable part of the webcam frame even when the player is close to it.
  const clampToScanBand = ({ x, y }) => ({
    x,
    y: Math.min(shoulderMidY + shoulderWidth * 0.62, Math.max(shoulderMidY - shoulderWidth * 0.52, y)),
  });
  const createArm = (shoulder, arm) => {
    const upper = unit(arm.upper);
    const elbow = clampToScanBand({ x: shoulder.x + upper.x * upperLength, y: shoulder.y + upper.y * upperLength });
    const fore = unit(arm.forearm);
    return { elbow, wrist: clampToScanBand({ x: elbow.x + fore.x * foreLength, y: elbow.y + fore.y * foreLength }) };
  };
  const leftArm = createArm(points.leftShoulder, config.left);
  const rightArm = createArm(points.rightShoulder, config.right);
  Object.assign(points, { leftElbow: leftArm.elbow, leftWrist: leftArm.wrist, rightElbow: rightArm.elbow, rightWrist: rightArm.wrist });
  const indexes = { leftElbow: 13, leftWrist: 15, rightElbow: 14, rightWrist: 16 };
  const matchRadius = Math.max(28, shoulderWidth * (config.matchRadius ?? 0.46));
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
  const config = EXHIBIT_POSE_CONFIGS[target.id];
  const shoulderY = height * 0.44;
  const shoulders = [{ x: width * 0.39, y: shoulderY }, { x: width * 0.61, y: shoulderY }];
  const upperLength = width * 0.105;
  const foreLength = width * 0.1;
  const unit = ([x, y]) => { const length = Math.hypot(x, y); return { x: x / length, y: y / length }; };
  const clampToScanBand = ({ x, y }) => ({ x, y: Math.min(height * 0.67, Math.max(height * 0.27, y)) });
  const arm = (shoulder, definition) => {
    const upper = unit(definition.upper);
    const elbow = clampToScanBand({ x: shoulder.x + upper.x * upperLength, y: shoulder.y + upper.y * upperLength });
    const fore = unit(definition.forearm);
    return { elbow, wrist: clampToScanBand({ x: elbow.x + fore.x * foreLength, y: elbow.y + fore.y * foreLength }) };
  };
  const left = arm(shoulders[0], config.left); const right = arm(shoulders[1], config.right);
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

export function PoseShadowDemo({ exhibitId, cameraStream, onComplete }) {
  const target = TARGETS.find(({ id }) => id === exhibitId) ?? TARGETS[0];
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const landmarkerRef = useRef(null);
  const animationFrameRef = useRef(0);
  const lastVideoTimeRef = useRef(-1);
  const holdStartedAtRef = useRef(null);
  const lastMatchedAtRef = useRef(0);
  const lastProgressRef = useRef(0);
  const targetRef = useRef(target);
  const onCompleteRef = useRef(onComplete);
  const actionStartedAtRef = useRef(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isMatching, setIsMatching] = useState(false);
  const [holdProgress, setHoldProgress] = useState(0);
  const [alarm, setAlarm] = useState(40);
  const [status, setStatus] = useState('准备开始扫描');
  const [error, setError] = useState('');
  const [scanSeconds, setScanSeconds] = useState(10);

  const detectFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const landmarker = landmarkerRef.current;
    if (!video || !canvas || !landmarker || !streamRef.current) return;
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.currentTime !== lastVideoTimeRef.current) {
      lastVideoTimeRef.current = video.currentTime;
      const landmarks = landmarker.detectForVideo(video, performance.now()).landmarks[0];
      const target = targetRef.current;
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
          cancelAnimationFrame(animationFrameRef.current);
          setAlarm((value) => Math.max(0, value - 10));
          setStatus('伪装成功！正在返回展厅…');
          onCompleteRef.current?.(exhibitId);
          return;
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

  const startScanner = useCallback(async () => {
    setError(''); setStatus('正在连接扫描器…');
    try {
      if (!cameraStream?.active) throw new Error('摄像头尚未开启，请返回主地图上方栏开启扫描摄像头。');
      const { FilesetResolver, PoseLandmarker } = await import(`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VERSION}`);
      const vision = await FilesetResolver.forVisionTasks(WASM_ROOT);
      if (!landmarkerRef.current) {
        const options = { baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' }, runningMode: 'VIDEO', numPoses: 1, minPoseDetectionConfidence: 0.55, minPosePresenceConfidence: 0.55, minTrackingConfidence: 0.5 };
        try { landmarkerRef.current = await PoseLandmarker.createFromOptions(vision, options); }
        catch { landmarkerRef.current = await PoseLandmarker.createFromOptions(vision, { ...options, baseOptions: { modelAssetPath: MODEL_URL, delegate: 'CPU' } }); }
      }
      streamRef.current = cameraStream; videoRef.current.srcObject = cameraStream;
      await videoRef.current.play();
      actionStartedAtRef.current = performance.now();
      setScanSeconds(10);
      setIsRunning(true); setStatus(`扫描灯靠近 · 模仿${targetRef.current.title}`);
      animationFrameRef.current = requestAnimationFrame(detectFrame);
    } catch (caughtError) {
      streamRef.current = null;
      setError(caughtError.message || '无法启动摄像头。'); setStatus('扫描器连接失败');
    }
  }, [cameraStream, detectFrame]);

  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);
  useEffect(() => {
    startScanner();
    return () => {
      cancelAnimationFrame(animationFrameRef.current);
      streamRef.current = null;
      if (videoRef.current) { videoRef.current.pause(); videoRef.current.srcObject = null; }
      landmarkerRef.current?.close();
      landmarkerRef.current = null;
    };
  }, [startScanner]);
  useEffect(() => {
    if (!isRunning && canvasRef.current) drawPose(canvasRef.current, null, false, target);
  }, [isRunning, target]);

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
            <p className="target-step">目标动作 01 / 01 · {target.title}</p>
            <img className="pose-reference-backdrop" src={target.referenceImage} alt="" />
            <canvas ref={canvasRef} width="1124" height="596" aria-label="目标姿势虚影与实时关节点识别" />
            <div className="pose-progress" aria-label={`姿势匹配进度 ${Math.round(holdProgress)}%`}>
              <span>姿势匹配进度</span>
              <div className="pose-meter"><img src={asset('pose_progress_frame.png')} alt="" /><img className="meter-fill" style={{ clipPath: `inset(0 ${100 - holdProgress}% 0 0)` }} src={asset('pose_progress_fill_segments.png')} alt="" /></div>
              <strong>{Math.round(holdProgress)}%</strong>
            </div>
            {!isRunning && <p className="scan-hint">{error ? '请返回主地图上方栏开启摄像头' : '正在接入已开启的扫描摄像头…'}</p>}
          </section>

          <footer className="result-banner">
            <img src={asset('result_banner_blank.png')} alt="" />
            <div className="result-copy"><span>成功：获得安全窗口</span><b className="scan-auto-label">{isRunning ? '扫描中' : '等待摄像头'}</b><em>失败：警戒上升</em></div>
          </footer>
          {error && <p className="error-message">{error}</p>}
        </section>
        <video ref={videoRef} muted playsInline />
      </section>
      <p className="privacy-note" aria-live="polite">{status} · 摄像头与关键点仅在本机浏览器内处理。</p>
    </main>
  );
}

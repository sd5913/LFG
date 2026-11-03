import { useCallback, useEffect, useRef, useState } from 'react';

const TASKS_VERSION = '0.10.14';
const WASM_ROOT = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VERSION}/wasm`;
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

const UPPER_BODY = [
  [0, 7], [0, 8], [7, 11], [8, 12], [11, 12],
  [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24],
];
const JOINTS = [0, 7, 8, 11, 12, 13, 14, 15, 16, 23, 24];
const HOLD_DURATION_MS = 3000;
const TARGET_ARM_CONFIGS = {
  'hands-in-prayer': { upper: [0.18, 1], forearm: [-0.88, 0.48] },
  'holding-scroll': { upper: [0.05, 1], forearm: [-0.62, 0.38] },
  'arms-crossed': { upper: [-0.6, 0.8], forearm: [-0.85, 0.25] },
};

const TARGETS = [
  {
    id: 'hands-in-prayer',
    title: '祈祷雕像',
    description: '双手在胸前合拢，像一尊安静的祈祷雕像。',
  },
  {
    id: 'holding-scroll',
    title: '持卷轴雕像',
    description: '双手在胸前微微分开，像捧着一卷珍贵文物。',
  },
  {
    id: 'arms-crossed',
    title: '庄严交臂',
    description: '在胸前交叠双臂，双手分别靠近另一侧肩膀。',
  },
];

function pointsAreReliable(landmarks, indexes) {
  return indexes.every((index) => landmarks[index]?.visibility == null || landmarks[index].visibility > 0.45);
}

function getTargetGuide(width, height, target, landmarks) {
  const config = TARGET_ARM_CONFIGS[target.id];
  if (!config || !landmarks || !pointsAreReliable(landmarks, [0, 7, 8, 11, 12, 13, 14, 15, 16])) return null;
  const canvasPoint = (index) => ({ x: (1 - landmarks[index].x) * width, y: landmarks[index].y * height });
  const points = {
    head: canvasPoint(0), leftEar: canvasPoint(7), rightEar: canvasPoint(8),
    leftShoulder: canvasPoint(11), rightShoulder: canvasPoint(12),
  };
  if (pointsAreReliable(landmarks, [23, 24])) {
    points.leftHip = canvasPoint(23);
    points.rightHip = canvasPoint(24);
  }
  const shoulderCenter = { x: (points.leftShoulder.x + points.rightShoulder.x) / 2, y: (points.leftShoulder.y + points.rightShoulder.y) / 2 };
  const shoulderWidth = Math.hypot(points.rightShoulder.x - points.leftShoulder.x, points.rightShoulder.y - points.leftShoulder.y);
  const measuredUpperArm = (Math.hypot(points.leftShoulder.x - canvasPoint(13).x, points.leftShoulder.y - canvasPoint(13).y)
    + Math.hypot(points.rightShoulder.x - canvasPoint(14).x, points.rightShoulder.y - canvasPoint(14).y)) / 2;
  const measuredForearm = (Math.hypot(canvasPoint(13).x - canvasPoint(15).x, canvasPoint(13).y - canvasPoint(15).y)
    + Math.hypot(canvasPoint(14).x - canvasPoint(16).x, canvasPoint(14).y - canvasPoint(16).y)) / 2;
  const upperArmLength = Math.min(Math.max(measuredUpperArm, shoulderWidth * 0.42), shoulderWidth * 0.68);
  const forearmLength = Math.min(Math.max(measuredForearm, shoulderWidth * 0.42), shoulderWidth * 0.68);
  const unit = ([x, y]) => {
    const length = Math.hypot(x, y);
    return { x: x / length, y: y / length };
  };
  const createArm = (shoulder, side) => {
    const upperDirection = unit([side * config.upper[0], config.upper[1]]);
    const elbow = { x: shoulder.x + upperDirection.x * upperArmLength, y: shoulder.y + upperDirection.y * upperArmLength };
    const forearmDirection = unit([side * config.forearm[0], config.forearm[1]]);
    return { elbow, wrist: { x: elbow.x + forearmDirection.x * forearmLength, y: elbow.y + forearmDirection.y * forearmLength } };
  };
  const leftSide = Math.sign(points.leftShoulder.x - shoulderCenter.x) || -1;
  const rightSide = Math.sign(points.rightShoulder.x - shoulderCenter.x) || 1;
  const leftArm = createArm(points.leftShoulder, leftSide);
  const rightArm = createArm(points.rightShoulder, rightSide);
  Object.assign(points, { leftElbow: leftArm.elbow, leftWrist: leftArm.wrist, rightElbow: rightArm.elbow, rightWrist: rightArm.wrist });
  const actionLandmarks = { leftElbow: 13, leftWrist: 15, rightElbow: 14, rightWrist: 16 };
  const matchRadius = Math.max(20, shoulderWidth * 0.3);
  const matchedPoints = Object.fromEntries(Object.entries(actionLandmarks).map(([name, index]) => {
    const live = canvasPoint(index);
    return [name, Math.hypot(live.x - points[name].x, live.y - points[name].y) < matchRadius];
  }));
  return { points, matchedPoints, matchRadius, isMatched: Object.values(matchedPoints).every(Boolean) };
}

function drawTargetGuide(context, width, height, target, landmarks) {
  const guide = getTargetGuide(width, height, target, landmarks);
  if (!guide) return null;
  const { points } = guide;
  const connections = [
    ['head', 'leftEar'], ['head', 'rightEar'], ['leftEar', 'leftShoulder'], ['rightEar', 'rightShoulder'], ['leftShoulder', 'rightShoulder'],
    ['leftShoulder', 'leftElbow'], ['leftElbow', 'leftWrist'], ['rightShoulder', 'rightElbow'], ['rightElbow', 'rightWrist'],
    ['leftShoulder', 'leftHip'], ['rightShoulder', 'rightHip'], ['leftHip', 'rightHip'],
  ];
  context.save();
  context.strokeStyle = 'rgba(132, 196, 217, .72)';
  context.lineWidth = Math.max(8, width * 0.014);
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.setLineDash([10, 12]);
  context.beginPath();
  connections.forEach(([from, to]) => {
    if (!points[from] || !points[to]) return;
    context.moveTo(points[from].x, points[from].y);
    context.lineTo(points[to].x, points[to].y);
  });
  context.stroke();
  context.setLineDash([]);
  Object.values(points).filter(Boolean).forEach(({ x, y }) => {
    context.beginPath();
    context.arc(x, y, width * 0.016, 0, Math.PI * 2);
    context.fillStyle = 'rgba(167, 220, 235, .78)';
    context.fill();
  });
  context.font = `500 ${Math.max(12, width * 0.022)}px 'DM Mono', monospace`;
  context.fillStyle = 'rgba(190, 232, 242, .92)';
  context.fillText(`目标雕像：${target.title}`, width * 0.04, height * 0.08);
  context.restore();
  return guide;
}

function drawGuidePointHighlights(context, width, guide) {
  if (!guide) return;
  context.save();
  Object.entries(guide.matchedPoints).forEach(([name, matched]) => {
    if (!matched) return;
    const { x, y } = guide.points[name];
    context.shadowColor = 'rgba(255, 255, 255, .95)';
    context.shadowBlur = 24;
    context.fillStyle = '#ffffff';
    context.beginPath();
    context.arc(x, y, Math.max(width * 0.021, guide.matchRadius * 0.74), 0, Math.PI * 2);
    context.fill();
  });
  context.restore();
}

function drawShadow(canvas, landmarks, isMatching = false, target = TARGETS[0], guide) {
  const context = canvas.getContext('2d');
  const { width, height } = canvas;
  context.clearRect(0, 0, width, height);
  const activeGuide = guide ?? drawTargetGuide(context, width, height, target, landmarks);
  if (guide) drawTargetGuide(context, width, height, target, landmarks);

  if (!landmarks) return;
  const point = (index) => {
    const landmark = landmarks[index];
    return { x: (1 - landmark.x) * width, y: landmark.y * height };
  };
  const reliable = (index) => landmarks[index]?.visibility == null || landmarks[index].visibility > 0.45;

  context.save();
  context.shadowColor = isMatching ? 'rgba(136, 236, 168, 0.76)' : 'rgba(255, 220, 133, 0.70)';
  context.shadowBlur = 22;
  context.strokeStyle = isMatching ? '#9ff0b3' : '#ffe3a2';
  context.lineWidth = Math.max(13, width * 0.022);
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.beginPath();
  UPPER_BODY.forEach(([from, to]) => {
    if (!reliable(from) || !reliable(to)) return;
    const start = point(from);
    const end = point(to);
    context.moveTo(start.x, start.y);
    context.lineTo(end.x, end.y);
  });
  context.stroke();

  context.fillStyle = isMatching ? '#d1ffda' : '#fff0c8';
  JOINTS.forEach((index) => {
    if (!reliable(index)) return;
    const { x, y } = point(index);
    const isHead = index === 0;
    const isHand = index === 15 || index === 16;
    context.beginPath();
    context.arc(x, y, isHead ? width * 0.055 : isHand ? width * 0.027 : width * 0.018, 0, Math.PI * 2);
    context.fill();
  });
  context.restore();
  drawGuidePointHighlights(context, width, activeGuide);
}

export function PoseShadowDemo() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const landmarkerRef = useRef(null);
  const streamRef = useRef(null);
  const frameRef = useRef(0);
  const lastTimeRef = useRef(-1);
  const targetIndexRef = useRef(0);
  const holdStartedAtRef = useRef(null);
  const lastProgressRef = useRef(0);
  const [status, setStatus] = useState('摄像头未启动');
  const [isRunning, setIsRunning] = useState(false);
  const [poseFound, setPoseFound] = useState(false);
  const [error, setError] = useState('');
  const [targetIndex, setTargetIndex] = useState(0);
  const [holdProgress, setHoldProgress] = useState(0);
  const [completedTasks, setCompletedTasks] = useState(0);

  const stopCamera = useCallback(() => {
    cancelAnimationFrame(frameRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    if (canvasRef.current) drawShadow(canvasRef.current, null, false, TARGETS[targetIndexRef.current]);
    holdStartedAtRef.current = null;
    lastProgressRef.current = 0;
    setHoldProgress(0);
    setIsRunning(false);
    setPoseFound(false);
    setStatus('摄像头未启动');
  }, []);

  const detectFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const landmarker = landmarkerRef.current;
    if (!video || !canvas || !landmarker || !streamRef.current) return;

    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.currentTime !== lastTimeRef.current) {
      lastTimeRef.current = video.currentTime;
      const result = landmarker.detectForVideo(video, performance.now());
      const landmarks = result.landmarks[0];
      const target = TARGETS[targetIndexRef.current];
      const guide = getTargetGuide(canvas.width, canvas.height, target, landmarks);
      const matching = Boolean(guide?.isMatched);
      drawShadow(canvas, landmarks, matching, target, guide);
      setPoseFound(Boolean(landmarks));
      if (!landmarks) {
        holdStartedAtRef.current = null;
        if (lastProgressRef.current !== 0) setHoldProgress(0);
        lastProgressRef.current = 0;
        setStatus('请站到镜头内，让头部、肩膀与双手都可见');
      } else if (matching) {
        const now = performance.now();
        holdStartedAtRef.current ??= now;
        const progress = Math.min(100, ((now - holdStartedAtRef.current) / HOLD_DURATION_MS) * 100);
        if (Math.abs(progress - lastProgressRef.current) > 0.8) {
          lastProgressRef.current = progress;
          setHoldProgress(progress);
        }
        if (progress >= 100) {
          const nextIndex = (targetIndexRef.current + 1) % TARGETS.length;
          targetIndexRef.current = nextIndex;
          holdStartedAtRef.current = null;
          lastProgressRef.current = 0;
          setTargetIndex(nextIndex);
          setHoldProgress(0);
          setCompletedTasks((count) => count + 1);
          setStatus('伪装成功！下一项姿势任务已开始。');
        } else {
          setStatus(`姿势匹配中，请再保持 ${(HOLD_DURATION_MS / 1000 - ((now - holdStartedAtRef.current) / 1000)).toFixed(1)} 秒`);
        }
      } else {
        holdStartedAtRef.current = null;
        if (lastProgressRef.current !== 0) setHoldProgress(0);
        lastProgressRef.current = 0;
        setStatus(`模仿目标姿势：${target.title}`);
      }
    }
    frameRef.current = requestAnimationFrame(detectFrame);
  }, []);

  const startCamera = useCallback(async () => {
    setError('');
    setStatus('Loading pose model…');
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('This browser does not provide camera access. Try a current Chrome, Edge, or Safari browser.');
      }
      const [{ FilesetResolver, PoseLandmarker }, stream] = await Promise.all([
        import(`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VERSION}`),
        navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 1280, height: 720 }, audio: false }),
      ]);
      const vision = await FilesetResolver.forVisionTasks(WASM_ROOT);
      if (!landmarkerRef.current) {
        const options = {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
          runningMode: 'VIDEO',
          numPoses: 1,
          minPoseDetectionConfidence: 0.55,
          minPosePresenceConfidence: 0.55,
          minTrackingConfidence: 0.5,
        };
        try {
          landmarkerRef.current = await PoseLandmarker.createFromOptions(vision, options);
        } catch {
          landmarkerRef.current = await PoseLandmarker.createFromOptions(vision, {
            ...options,
            baseOptions: { modelAssetPath: MODEL_URL, delegate: 'CPU' },
          });
        }
      }
      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setIsRunning(true);
      setStatus('正在寻找你的上半身…');
      frameRef.current = requestAnimationFrame(detectFrame);
    } catch (caughtError) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setError(caughtError.message || 'Could not start the camera.');
      setStatus('Camera unavailable');
    }
  }, [detectFrame]);

  useEffect(() => () => {
    cancelAnimationFrame(frameRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    landmarkerRef.current?.close();
  }, []);

  useEffect(() => {
    if (!isRunning && canvasRef.current) drawShadow(canvasRef.current, null, false, TARGETS[targetIndex]);
  }, [isRunning, targetIndex]);

  return (
    <main className="app-shell">
      <header className="hero">
        <p className="eyebrow">Museum Heist · interaction prototype</p>
        <h1>Pose Shadow Lab</h1>
        <p className="intro">模仿博物馆的目标剪影。保持姿势连续匹配 3 秒，即可完成当前伪装并进入下一项任务。</p>
      </header>

      <section className="task-panel" aria-label="Current pose task">
        <div className="task-copy">
          <p className="task-kicker">当前伪装任务 · {targetIndex + 1} / {TARGETS.length}</p>
          <h2>{TARGETS[targetIndex].title}</h2>
          <p>{TARGETS[targetIndex].description} 目标与实时映射使用完全相同的关节和骨架结构；每个手肘、手腕落入目标点周围约 30% 肩宽的容差范围时会亮起白光。</p>
        </div>
        <div className="hold-meter" aria-label={`Pose hold progress: ${Math.round(holdProgress)} percent`}>
          <div className="hold-meter-label"><span>{holdProgress > 0 ? '保持姿势中' : '等待匹配'}</span><strong>{Math.ceil(holdProgress / 100 * 3)} / 3 秒</strong></div>
          <div className="progress-track"><span style={{ width: `${holdProgress}%` }} /></div>
          <p>已完成 {completedTasks} 项伪装</p>
        </div>
      </section>

      <section className="demo-grid" aria-label="Live pose shadow demo">
        <div className="camera-card">
          <div className="card-label"><span className="live-dot" /> 摄像头输入</div>
          <div className="camera-stage">
            <video ref={videoRef} muted playsInline aria-label="Your mirrored camera feed" />
            {!isRunning && <div className="stage-placeholder">摄像头画面将在这里出现</div>}
          </div>
        </div>

        <div className="shadow-card">
          <div className="card-label"><span className={poseFound ? 'detected-dot' : 'waiting-dot'} /> 2D 姿势影子与目标轮廓</div>
          <div className="shadow-stage">
            <div className="spotlight" />
            <canvas ref={canvasRef} width="720" height="540" aria-label="Live 2D upper-body pose shadow" />
            {!poseFound && <div className="shadow-hint">{isRunning ? '请让头部、肩膀与双手都出现在画面中' : '淡蓝虚线是目标；启动摄像头后会叠加你的影子'}</div>}
          </div>
        </div>
      </section>

      <section className="control-panel" aria-live="polite">
        <div>
          <p className="status-title">{status}</p>
          <p className="status-help">{error || '摄像头画面与关键点均只在此浏览器本地处理，不会被录制或上传。'}</p>
        </div>
        <button className="primary-button" type="button" onClick={isRunning ? stopCamera : startCamera}>
          {isRunning ? '停止摄像头' : '启动摄像头'}
        </button>
      </section>

      <section className="instructions">
        <h2>试玩方法</h2>
        <ol>
          <li>允许摄像头权限，并确保头部、肩膀、手肘和手腕都在画面内。</li>
          <li>右侧画布中的淡蓝虚线是目标动作；它会随你的头肩位置缩放。手肘或手腕进入目标点周围约 30% 肩宽的范围时，对应点会亮起白光；影子变绿后，持续保持到进度条填满。</li>
          <li>每次完成会自动切换下一项任务；画面为镜像显示，且一次只追踪一人。</li>
        </ol>
      </section>
    </main>
  );
}

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

const TARGETS = [
  {
    id: 'arms-out',
    title: '双臂展开',
    description: '双臂向两侧展开，手腕大致与肩膀同高。',
  },
  {
    id: 'left-arm-up',
    title: '左手举高',
    description: '把你的左手举到左肩上方。',
  },
  {
    id: 'right-arm-up',
    title: '右手举高',
    description: '把你的右手举到右肩上方。',
  },
  {
    id: 'hands-crossed',
    title: '双手交叉',
    description: '在胸前交叉双手，让两个手腕靠近。',
  },
];

function pointsAreReliable(landmarks, indexes) {
  return indexes.every((index) => landmarks[index]?.visibility == null || landmarks[index].visibility > 0.45);
}

function isTargetPose(landmarks, targetId) {
  if (!landmarks || !pointsAreReliable(landmarks, [11, 12, 13, 14, 15, 16, 23, 24])) return false;

  const leftShoulder = landmarks[11];
  const rightShoulder = landmarks[12];
  const leftElbow = landmarks[13];
  const rightElbow = landmarks[14];
  const leftWrist = landmarks[15];
  const rightWrist = landmarks[16];
  const shoulderWidth = Math.abs(rightShoulder.x - leftShoulder.x);
  const shoulderMiddleY = (leftShoulder.y + rightShoulder.y) / 2;
  const hipMiddleY = (landmarks[23].y + landmarks[24].y) / 2;
  const armIsRaised = (shoulder, elbow, wrist) =>
    wrist.y < shoulder.y - Math.max(0.09, shoulderWidth * 0.3) && elbow.y < shoulder.y + 0.08;

  switch (targetId) {
    case 'arms-out':
      return Math.abs(leftWrist.y - leftShoulder.y) < 0.16
        && Math.abs(rightWrist.y - rightShoulder.y) < 0.16
        && Math.abs(leftWrist.x - rightWrist.x) > shoulderWidth * 2.15;
    case 'left-arm-up':
      return armIsRaised(leftShoulder, leftElbow, leftWrist);
    case 'right-arm-up':
      return armIsRaised(rightShoulder, rightElbow, rightWrist);
    case 'hands-crossed': {
      const wristDistance = Math.hypot(leftWrist.x - rightWrist.x, leftWrist.y - rightWrist.y);
      const wristMiddleY = (leftWrist.y + rightWrist.y) / 2;
      return wristDistance < Math.max(0.15, shoulderWidth * 0.8)
        && wristMiddleY > shoulderMiddleY - 0.04
        && wristMiddleY < hipMiddleY + 0.06;
    }
    default:
      return false;
  }
}

function drawShadow(canvas, landmarks, isMatching = false) {
  const context = canvas.getContext('2d');
  const { width, height } = canvas;
  context.clearRect(0, 0, width, height);

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
}

function TargetPoseIcon({ target }) {
  const poses = {
    'arms-out': { leftElbow: [24, 53], leftWrist: [8, 53], rightElbow: [76, 53], rightWrist: [92, 53] },
    'left-arm-up': { leftElbow: [29, 30], leftWrist: [27, 10], rightElbow: [76, 66], rightWrist: [87, 82] },
    'right-arm-up': { leftElbow: [71, 30], leftWrist: [73, 10], rightElbow: [24, 66], rightWrist: [13, 82] },
    'hands-crossed': { leftElbow: [37, 61], leftWrist: [58, 68], rightElbow: [63, 61], rightWrist: [42, 68] },
  };
  const pose = poses[target.id];
  const lines = [[50, 21, 38, 45], [50, 21, 62, 45], [38, 45, pose.leftElbow[0], pose.leftElbow[1]], [pose.leftElbow[0], pose.leftElbow[1], pose.leftWrist[0], pose.leftWrist[1]], [62, 45, pose.rightElbow[0], pose.rightElbow[1]], [pose.rightElbow[0], pose.rightElbow[1], pose.rightWrist[0], pose.rightWrist[1]], [38, 45, 42, 86], [62, 45, 58, 86], [42, 86, 58, 86]];
  return (
    <svg className="target-icon" viewBox="0 0 100 100" aria-label={`${target.title} target pose`} role="img">
      <circle cx="50" cy="12" r="9" />
      {lines.map(([x1, y1, x2, y2], index) => <line key={index} x1={x1} y1={y1} x2={x2} y2={y2} />)}
      {[pose.leftWrist, pose.rightWrist].map(([cx, cy], index) => <circle key={index} cx={cx} cy={cy} r="4.7" />)}
    </svg>
  );
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
  const [status, setStatus] = useState('Camera is off');
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
    if (canvasRef.current) drawShadow(canvasRef.current, null);
    holdStartedAtRef.current = null;
    lastProgressRef.current = 0;
    setHoldProgress(0);
    setIsRunning(false);
    setPoseFound(false);
    setStatus('Camera is off');
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
      const matching = isTargetPose(landmarks, target.id);
      drawShadow(canvas, landmarks, matching);
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

  return (
    <main className="app-shell">
      <header className="hero">
        <p className="eyebrow">Museum Heist · interaction prototype</p>
        <h1>Pose Shadow Lab</h1>
        <p className="intro">模仿博物馆的目标剪影。保持姿势连续匹配 3 秒，即可完成当前伪装并进入下一项任务。</p>
      </header>

      <section className="task-panel" aria-label="Current pose task">
        <TargetPoseIcon target={TARGETS[targetIndex]} />
        <div className="task-copy">
          <p className="task-kicker">当前伪装任务 · {targetIndex + 1} / {TARGETS.length}</p>
          <h2>{TARGETS[targetIndex].title}</h2>
          <p>{TARGETS[targetIndex].description}</p>
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
          <div className="card-label"><span className={poseFound ? 'detected-dot' : 'waiting-dot'} /> 2D 姿势影子</div>
          <div className="shadow-stage">
            <div className="spotlight" />
            <canvas ref={canvasRef} width="720" height="540" aria-label="Live 2D upper-body pose shadow" />
            {!poseFound && <div className="shadow-hint">{isRunning ? '请让头部、肩膀与双手都出现在画面中' : '启动摄像头后生成你的影子'}</div>}
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
          <li>模仿上方的目标姿势。影子变绿后，持续保持到进度条填满。</li>
          <li>每次完成会自动切换下一项任务；画面为镜像显示，且一次只追踪一人。</li>
        </ol>
      </section>
    </main>
  );
}

import { publicAsset } from './public-asset.js';
import { hasLiveVideo } from './game-camera.js';
import { GameplayHud } from './gameplay-hud.jsx';
import { useGameText } from './use-game-language.js';
import { useCallback, useEffect, useRef, useState } from 'react';

const TASKS_VERSION = '0.10.14';
const WASM_ROOT = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VERSION}/wasm`;
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
const HOLD_DURATION_MS = 2000;
const SCAN_DURATION_MS = 20000;
const JITTER_GRACE_MS = 220;
const ASSET_ROOT = publicAsset('stealth-ui');

// These guides and matching joints are authored from the four blue-frame
// display images, rather than sharing the earlier rotating demo targets.
const EXHIBIT_POSE_CONFIGS = Object.freeze({
  'case-nw': {
    title: ['鸟首祈祷雕像', 'Bird-headed prayer statue'], instruction: ['双手在胸前交握，保持不动', 'Clasp both hands at your chest and hold still'],
    referenceImage: publicAsset('assets/exhibits/case-nw-hidden.png'),
    // Low, nearly central elbows make both palms meet at the sternum.
    left: { upper: [-0.18, 0.98], forearm: [0.94, -0.34] },
    right: { upper: [0.18, 0.98], forearm: [-0.94, -0.34] },
  },
  'case-sw': {
    title: ['持卷轴雕像', 'Scroll-bearing statue'], instruction: ['双手在胸前捧起卷轴，保持不动', 'Hold an imaginary scroll at chest height and stay still'],
    referenceImage: publicAsset('assets/exhibits/case-sw-hidden.png'),
    // Unlike the prayer pose, elbows open out and each hand stays on one side
    // of the imaginary scroll instead of meeting in the centre.
    left: { upper: [-0.8, 0.6], forearm: [1, -0.1] },
    right: { upper: [0.8, 0.6], forearm: [-1, -0.1] },
  },
  'case-ne': {
    title: ['星月抚额雕像', 'Crescent statue'], instruction: ['左手轻扶额角，右手自然收于腹前', 'Touch your left temple and rest your right hand at your abdomen'],
    referenceImage: publicAsset('assets/exhibits/case-ne-hidden.png'),
    // The raised hand stops beside the forehead, never above the head.
    left: { upper: [-0.6, -0.42], forearm: [0.54, -0.84] },
    right: { upper: [0.5, 0.76], forearm: [-0.86, -0.18] },
    required: ['leftElbow', 'leftWrist'],
  },
  'case-se': {
    title: ['宝石抱臂雕像', 'Jeweled statue'], instruction: ['左臂斜搭右肩，右手自然垂于腹前', 'Cross your left arm to your right shoulder and lower your right hand to your abdomen'],
    referenceImage: publicAsset('assets/exhibits/case-se-hidden.png'),
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
  .map(([id, { title, referenceImage }]) => ({
    id, title, referenceImage,
    matchHint: [`模仿目标姿势：${title[0]}`, `Match the ${title[1].toLowerCase()}`],
  }));

const POSE_MATCHED = ['姿势正确，继续保持', 'Pose matched. Hold still.'];
const POSE_JITTER = ['正在容忍短暂识别抖动，请保持姿势', 'Tracking briefly lost. Hold your pose.'];
const POSE_NOT_FOUND = ['请站到扫描窗口中央', 'Stand in the center of the scan window'];

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

export function PoseShadowDemo({ exhibitId, cameraStream, onComplete, alertLevel = 0 }) {
  const t = useGameText();
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
  const elapsedRef = useRef(0);
  const [isRunning, setIsRunning] = useState(false);
  const [isMatching, setIsMatching] = useState(false);
  const [holdProgress, setHoldProgress] = useState(0);
  const [status, setStatus] = useState(['准备开始扫描', 'Ready to scan']);
  const [error, setError] = useState(false);
  const [scanSeconds, setScanSeconds] = useState(20);

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
      elapsedRef.current = elapsed;
      const nextSecond = Math.max(0, Math.ceil((SCAN_DURATION_MS - elapsed) / 1000));
      setScanSeconds((current) => current === nextSecond ? current : nextSecond);
      if (elapsed >= SCAN_DURATION_MS) {
        cancelAnimationFrame(animationFrameRef.current);
        setStatus(['扫描超时，你被捕了。', 'Time ran out. You were caught.']);
        onCompleteRef.current?.({ exhibitId, success: false, reason: 'timeout' });
        return;
      }
      if (matching) {
        lastMatchedAtRef.current = now;
        holdStartedAtRef.current ??= now;
        const progress = Math.min(100, ((now - holdStartedAtRef.current) / HOLD_DURATION_MS) * 100);
        if (Math.abs(lastProgressRef.current - progress) > 0.8) { lastProgressRef.current = progress; setHoldProgress(progress); }
        setStatus(POSE_MATCHED);
        if (progress >= 100) {
          cancelAnimationFrame(animationFrameRef.current);
          setStatus(['伪装成功！正在返回展厅…', 'Disguise successful. Returning to the gallery…']);
          onCompleteRef.current?.({ exhibitId, success: true });
          return;
        }
      } else {
        const withinGrace = holdStartedAtRef.current && now - lastMatchedAtRef.current < JITTER_GRACE_MS;
        if (withinGrace) {
          setStatus(POSE_JITTER);
        } else {
          holdStartedAtRef.current = null;
          if (lastProgressRef.current) setHoldProgress(0);
          lastProgressRef.current = 0;
          setStatus(landmarks ? target.matchHint : POSE_NOT_FOUND);
        }
      }
    }
    animationFrameRef.current = requestAnimationFrame(detectFrame);
  }, []);

  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);
  useEffect(() => {
    setIsRunning(false);
    setIsMatching(false);
    setHoldProgress(0);
    setError(false);
    holdStartedAtRef.current = null;
    lastProgressRef.current = 0;
    if (!hasLiveVideo(cameraStream)) {
      setStatus(['摄像头已关闭', 'Camera off']);
      return undefined;
    }

    let cancelled = false;
    const video = videoRef.current;
    const releaseScanner = () => {
      cancelAnimationFrame(animationFrameRef.current);
      streamRef.current = null;
      video.pause();
      video.srcObject = null;
      landmarkerRef.current?.close();
      landmarkerRef.current = null;
    };
    async function startScanner() {
      setStatus(['正在连接扫描器…', 'Connecting to the scanner…']);
      try {
        const { FilesetResolver, PoseLandmarker } = await import(`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VERSION}`);
        if (cancelled) return;
        const vision = await FilesetResolver.forVisionTasks(WASM_ROOT);
        if (cancelled) return;
        const options = { baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' }, runningMode: 'VIDEO', numPoses: 1, minPoseDetectionConfidence: 0.55, minPosePresenceConfidence: 0.55, minTrackingConfidence: 0.5 };
        let model;
        try { model = await PoseLandmarker.createFromOptions(vision, options); }
        catch { model = await PoseLandmarker.createFromOptions(vision, { ...options, baseOptions: { modelAssetPath: MODEL_URL, delegate: 'CPU' } }); }
        if (cancelled) { model.close(); return; }
        landmarkerRef.current = model;
        streamRef.current = cameraStream;
        video.srcObject = cameraStream;
        await video.play();
        if (cancelled) return;
        lastVideoTimeRef.current = -1;
        actionStartedAtRef.current = performance.now() - elapsedRef.current;
        setIsRunning(true);
        setStatus(['扫描灯靠近 · 模仿目标姿势', 'Scan light approaching · Match the target pose']);
        animationFrameRef.current = requestAnimationFrame(detectFrame);
      } catch {
        if (cancelled) return;
        releaseScanner();
        setError(true);
        setStatus(['扫描器连接失败', 'Could not connect to the scanner']);
      }
    }
    void startScanner();
    return () => {
      cancelled = true;
      releaseScanner();
    };
  }, [cameraStream, detectFrame]);
  useEffect(() => {
    if (!isRunning && canvasRef.current) drawPose(canvasRef.current, null, false, target);
  }, [isRunning, target]);

  return (
    <main className="stealth-shell">
      <section className="stealth-game" aria-label={t('博物馆姿势扫描挑战', 'Museum pose scan challenge')}>
        <img className="museum-backplate" src={asset('museum_scene_backplate.png')} alt="" />
        <div className="scene-dim" />

        <GameplayHud alertLevel={alertLevel} currentRoom={3} />

        <section className="challenge-layer">
          <div className="warning-banner">
            <img src={asset('warning_banner_blank.png')} alt="" />
            <div className="warning-copy"><strong>{t('扫描灯靠近 · 伪装成雕像', 'Scan light approaching · Pose as the statue')}</strong><span aria-label={t(`剩余 ${scanSeconds} 秒`, `${scanSeconds} seconds remaining`)}>{String(scanSeconds).padStart(2, '0')} {t('秒', 's')}</span></div>
          </div>

          <section className="pose-screen">
            <img src={asset('pose_screen_panel.png')} alt="" />
            <p className="target-step">{t('目标动作', 'Target pose')} 01 / 01 · {t(...target.title)}</p>
            <img className="pose-reference-backdrop" src={target.referenceImage} alt="" />
            <canvas ref={canvasRef} width="1124" height="596" aria-label={t('目标姿势虚影与实时关节点识别', 'Target silhouette and live body tracking')} />
            <div className="pose-progress" aria-label={`${t('姿势匹配进度', 'Pose match')} ${Math.round(holdProgress)}%`}>
              <span>{t('姿势匹配进度', 'Pose match')}</span>
              <div className="pose-meter"><img src={asset('pose_progress_frame.png')} alt="" /><img className="meter-fill" style={{ clipPath: `inset(0 ${100 - holdProgress}% 0 0)` }} src={asset('pose_progress_fill_segments.png')} alt="" /></div>
              <strong>{Math.round(holdProgress)}%</strong>
            </div>
            {!isRunning && <p className="scan-hint">{error ? t('无法启动姿势扫描', 'Could not start the pose scanner') : hasLiveVideo(cameraStream) ? t('正在接入已开启的扫描摄像头…', 'Connecting to the camera…') : t('请在顶部栏开启摄像头', 'Enable the camera in the top bar')}</p>}
          </section>

          <footer className="result-banner">
            <img src={asset('result_banner_blank.png')} alt="" />
            <div className="result-copy"><span>{t('成功：获得安全窗口', 'Success: Brief cover')}</span><b className="scan-auto-label">{isRunning ? t('扫描中', 'Scanning') : t('等待摄像头', 'Waiting for camera')}</b><em>{t('失败：警戒上升', 'Failure: Alert increases')}</em></div>
          </footer>
          {error && <p className="error-message">{t('请检查网络后，从顶部栏重新开启摄像头。', 'Check your connection, then restart the camera from the top bar.')}</p>}
        </section>
        <video ref={videoRef} muted playsInline />
      </section>
      <p className="privacy-note" aria-live="polite">{t(...status)} · {t('摄像头与关键点仅在本机浏览器内处理。', 'Camera frames and landmarks are processed locally.')}</p>
    </main>
  );
}

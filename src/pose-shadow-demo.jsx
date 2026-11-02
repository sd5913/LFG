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

function drawShadow(canvas, landmarks) {
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
  context.shadowColor = 'rgba(255, 220, 133, 0.70)';
  context.shadowBlur = 22;
  context.strokeStyle = '#ffe3a2';
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

  context.fillStyle = '#fff0c8';
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

export function PoseShadowDemo() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const landmarkerRef = useRef(null);
  const streamRef = useRef(null);
  const frameRef = useRef(0);
  const lastTimeRef = useRef(-1);
  const [status, setStatus] = useState('Camera is off');
  const [isRunning, setIsRunning] = useState(false);
  const [poseFound, setPoseFound] = useState(false);
  const [error, setError] = useState('');

  const stopCamera = useCallback(() => {
    cancelAnimationFrame(frameRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    if (canvasRef.current) drawShadow(canvasRef.current, null);
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
      drawShadow(canvas, landmarks);
      setPoseFound(Boolean(landmarks));
      setStatus(landmarks ? 'Upper body detected' : 'Step into the frame');
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
      setStatus('Looking for your upper body…');
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
        <p className="intro">Move your head, shoulders, arms, and hands: your live upper-body pose becomes a projected museum shadow.</p>
      </header>

      <section className="demo-grid" aria-label="Live pose shadow demo">
        <div className="camera-card">
          <div className="card-label"><span className="live-dot" /> Camera input</div>
          <div className="camera-stage">
            <video ref={videoRef} muted playsInline aria-label="Your mirrored camera feed" />
            {!isRunning && <div className="stage-placeholder">Camera preview will appear here</div>}
          </div>
        </div>

        <div className="shadow-card">
          <div className="card-label"><span className={poseFound ? 'detected-dot' : 'waiting-dot'} /> 2D pose shadow</div>
          <div className="shadow-stage">
            <div className="spotlight" />
            <canvas ref={canvasRef} width="720" height="540" aria-label="Live 2D upper-body pose shadow" />
            {!poseFound && <div className="shadow-hint">{isRunning ? 'Stand back so your head and shoulders are visible' : 'Start the camera to cast a shadow'}</div>}
          </div>
        </div>
      </section>

      <section className="control-panel" aria-live="polite">
        <div>
          <p className="status-title">{status}</p>
          <p className="status-help">{error || 'Camera frames and landmarks are processed locally in this browser; nothing is recorded or uploaded.'}</p>
        </div>
        <button className="primary-button" type="button" onClick={isRunning ? stopCamera : startCamera}>
          {isRunning ? 'Stop camera' : 'Start camera'}
        </button>
      </section>

      <section className="instructions">
        <h2>Try it</h2>
        <ol>
          <li>Allow camera access, then make sure your head, shoulders, elbows, and hands are in frame.</li>
          <li>Raise one arm, cross your hands, or spread both arms to test a potential disguise pose.</li>
          <li>The demo mirrors your movement so the screen feels natural. It tracks one person only.</li>
        </ol>
      </section>
    </main>
  );
}

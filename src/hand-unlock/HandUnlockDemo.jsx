import { useCallback, useEffect, useRef, useState } from 'react';
import { FilesetResolver, HandLandmarker, PoseLandmarker } from '@mediapipe/tasks-vision';
import { HAND_EDGES } from '../../treasure-hand-lock-demo1/src/hand-gestures.js';
import { evaluateUnlockGesture, UNLOCK_STEPS } from './recognize.js';
import './hand-unlock.css';

const WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const HAND_MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const POSE_MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
const HOLD_MS = 1200;
const asset = name => `${import.meta.env.BASE_URL}hand-unlock/${name}`;
const art = ['01-palms-pressed.png', '02-palms-spread.png', '03-wrists-crossed.png'];

async function makeLandmarker(Class, vision, model, options) {
  const base = { ...options, baseOptions: { modelAssetPath: model, delegate: 'GPU' }, runningMode: 'VIDEO' };
  try { return await Class.createFromOptions(vision, base); }
  catch { return Class.createFromOptions(vision, { ...base, baseOptions: { modelAssetPath: model, delegate: 'CPU' } }); }
}

function drawHands(canvas, hands) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#80e3c1'; ctx.fillStyle = '#f2d29e'; ctx.lineWidth = 3;
  for (const points of hands) {
    for (const [a, b] of HAND_EDGES) {
      ctx.beginPath(); ctx.moveTo(points[a].x * canvas.width, points[a].y * canvas.height);
      ctx.lineTo(points[b].x * canvas.width, points[b].y * canvas.height); ctx.stroke();
    }
    for (const p of points) {
      ctx.fillRect(p.x * canvas.width - 3, p.y * canvas.height - 3, 6, 6);
    }
  }
}

export function HandUnlockDemo({ cameraStream, onClose }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const ownsStreamRef = useRef(false);
  const modelsRef = useRef(null);
  const rafRef = useRef(0);
  const runRef = useRef(0);
  const stepRef = useRef(0);
  const holdRef = useRef({ ms: 0, lastAt: 0, lastMatch: 0 });
  const [step, setStep] = useState(0);
  const [hold, setHold] = useState(0);
  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState('点击“启动识别”，将上半身和双手放进镜头。');

  const stop = useCallback(() => {
    runRef.current += 1;
    cancelAnimationFrame(rafRef.current);
    if (ownsStreamRef.current) streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null; ownsStreamRef.current = false;
    if (videoRef.current) { videoRef.current.pause(); videoRef.current.srcObject = null; }
    modelsRef.current?.hand?.close(); modelsRef.current?.pose?.close(); modelsRef.current = null;
    if (canvasRef.current) canvasRef.current.getContext('2d').clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    setStatus('idle');
  }, []);
  useEffect(() => () => {
    runRef.current += 1; cancelAnimationFrame(rafRef.current);
    if (ownsStreamRef.current) streamRef.current?.getTracks().forEach(track => track.stop());
    modelsRef.current?.hand?.close(); modelsRef.current?.pose?.close();
  }, []);

  const start = useCallback(async () => {
    if (status === 'loading' || status === 'running') return;
    if (modelsRef.current || streamRef.current) stop();
    const run = ++runRef.current;
    setStatus('loading'); setMessage('正在加载手部和上半身识别模型，首次使用需要联网…');
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('此浏览器无法访问摄像头');
      const stream = cameraStream?.active ? cameraStream : await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 640, height: 480 }, audio: false });
      if (run !== runRef.current) { if (stream !== cameraStream) stream.getTracks().forEach(t => t.stop()); return; }
      streamRef.current = stream; ownsStreamRef.current = stream !== cameraStream;
      const video = videoRef.current;
      video.srcObject = stream; await video.play();
      canvasRef.current.width = video.videoWidth;
      canvasRef.current.height = video.videoHeight;
      const vision = await FilesetResolver.forVisionTasks(WASM);
      const hand = await makeLandmarker(HandLandmarker, vision, HAND_MODEL, { numHands: 2, minHandDetectionConfidence: .5 });
      const pose = await makeLandmarker(PoseLandmarker, vision, POSE_MODEL, { numPoses: 1, minPoseDetectionConfidence: .5 });
      if (run !== runRef.current) { hand.close(); pose.close(); return; }
      modelsRef.current = { hand, pose };
      stepRef.current = 0; holdRef.current = { ms: 0, lastAt: 0, lastMatch: 0 };
      setStep(0); setHold(0); setStatus('running'); setMessage('识别中：双手合拢并保持。');
      let lastInfer = 0, lastVideoTime = -1;
      const tick = now => {
        if (run !== runRef.current || !modelsRef.current) return;
        rafRef.current = requestAnimationFrame(tick);
        if (document.hidden || video.readyState < 2 || now - lastInfer < 90 || video.currentTime === lastVideoTime) return;
        lastInfer = now; lastVideoTime = video.currentTime;
        try {
          const hands = hand.detectForVideo(video, now).landmarks ?? [];
          const body = pose.detectForVideo(video, now).landmarks?.[0] ?? null;
          drawHands(canvasRef.current, hands);
          const current = UNLOCK_STEPS[stepRef.current];
          const result = evaluateUnlockGesture(body, hands, current.id);
          const memory = holdRef.current;
          const dt = memory.lastAt ? Math.min(130, now - memory.lastAt) : 0;
          memory.lastAt = now;
          if (result.matched) { memory.ms += dt; memory.lastMatch = now; }
          else if (!memory.lastMatch || now - memory.lastMatch > 220) memory.ms = 0;
          setHold(Math.min(1, memory.ms / HOLD_MS));
          setMessage(result.reason);
          if (memory.ms >= HOLD_MS) {
            memory.ms = 0; memory.lastMatch = 0;
            if (stepRef.current === UNLOCK_STEPS.length - 1) {
              setStep(UNLOCK_STEPS.length); setHold(1); setStatus('unlocked');
              setMessage('宝箱已解锁！三个手势都由摄像头识别完成。');
              window.dispatchEvent(new CustomEvent('lfg:treasure-unlocked', { detail: { item: 'ancient-relic', source: 'camera', unlocked: true } }));
              cancelAnimationFrame(rafRef.current);
            } else {
              stepRef.current += 1; setStep(stepRef.current); setHold(0);
              setMessage(`进入下一步：${UNLOCK_STEPS[stepRef.current].title}`);
            }
          }
        } catch (error) {
          cancelAnimationFrame(rafRef.current);
          setStatus('error'); setMessage(`识别失败：${error.message}`);
        }
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch (error) {
      if (run !== runRef.current) return;
      setStatus('error'); setMessage(`无法启动识别：${error.message}`);
      if (ownsStreamRef.current) streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null; ownsStreamRef.current = false;
    }
  }, [cameraStream, status, stop]);

  const unlocked = step === UNLOCK_STEPS.length;
  return <main className="hand-unlock-shell">
    <div className="hand-unlock-stage" style={{ backgroundImage: `url(${asset('scene.png')})` }}>
      <div className="hand-unlock-distance">宝物距离 0 m</div>
      <div className="hand-unlock-dim" />
      <section className="hand-unlock-modal" aria-label="宝箱手势开锁">
        <header className="hand-unlock-header">
          <h1>宝箱开锁</h1><span>依次完成三个手势</span>
          <button type="button" onClick={() => { stop(); onClose(); }} aria-label="返回展厅">返回展厅 ×</button>
        </header>
        <div className="hand-unlock-grid">
          <aside className="hand-unlock-reference">
            <h2>动作对照 <small>{String(Math.min(step + 1, 3)).padStart(2, '0')} / 03</small></h2>
            {UNLOCK_STEPS.map((item, i) => <div className={`hand-unlock-card ${i < step ? 'done' : i === step ? 'active' : 'pending'}`} key={item.id}>
              <img src={asset(art[i])} alt={item.title} />
              <div><strong>0{i + 1} {item.title}</strong><span>{unlocked || i < step ? '已完成 ✓' : i === step ? item.hint : '待解锁'}</span></div>
            </div>)}
          </aside>
          <div className="hand-unlock-main">
            <section className="hand-unlock-camera">
              <div className="hand-unlock-section-title"><h2>你的手势</h2><span>{status === 'running' ? '● 摄像头实时识别' : status === 'unlocked' ? '● 识别完成' : '摄像头未启动'}</span></div>
              <div className="hand-unlock-video-frame">
                <video ref={videoRef} playsInline muted autoPlay />
                <canvas ref={canvasRef} width="640" height="480" aria-hidden="true" />
                {status !== 'running' && status !== 'unlocked' && <div className="hand-unlock-camera-placeholder">将上半身和双手放入取景框</div>}
              </div>
              <p role="status">{message}</p>
              <div className="hand-unlock-actions">
                {status !== 'running' && <button type="button" onClick={start} disabled={status === 'loading'}>{status === 'loading' ? '正在加载…' : status === 'unlocked' ? '重新挑战' : '启动识别'}</button>}
                {(status === 'running' || status === 'unlocked') && <button type="button" onClick={stop}>关闭摄像头</button>}
              </div>
            </section>
            <section className="hand-unlock-lock" aria-label="开锁进度">
              <div className="hand-unlock-section-title"><h2>像素密码锁</h2><span>{unlocked ? '已解锁 3 / 3' : `已解锁 ${step} / 3`}</span></div>
              <div className={`hand-unlock-lock-art ${unlocked ? 'opened' : ''}`}><div className="hand-unlock-shackle" /><div className="hand-unlock-lock-body">
                {UNLOCK_STEPS.map((item, i) => <div className={`hand-unlock-slot ${i < step ? 'done' : i === step ? 'active' : ''}`} key={item.id}>
                  {i < step ? '✓' : `0${i + 1}`}{i === step && <span style={{ width: `${Math.round(hold * 100)}%` }} />}
                </div>)}
              </div></div>
            </section>
          </div>
        </div>
      </section>
    </div>
  </main>;
}

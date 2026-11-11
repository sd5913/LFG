import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import Phaser from 'phaser';
import Room1 from './game/Room1.js';
import { GAME } from './game/config.js';
import { PoseShadowDemo } from './pose-shadow-demo.jsx';
import './styles.css';

function RoomExperience({ onPoseDemo, resumeState, cameraStatus, cameraError, onToggleCamera }) {
  const host = useRef(null);
  const gameRef = useRef(null);
  const [state, setState] = useState({ ready: false, error: '', moving: false, facing: 'right', debug: false });
  useEffect(() => {
    let disposed = false;
    const scene = new Room1(value => { if (!disposed) setState(value); }, resumeState);
    const game = new Phaser.Game({
      type: Phaser.CANVAS,
      parent: host.current,
      width: GAME.width, height: GAME.height,
      backgroundColor: '#0b202a',
      pixelArt: true, roundPixels: true, antialias: false,
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: GAME.width, height: GAME.height },
      physics: { default: 'arcade', arcade: { gravity: { x: 0, y: 0 }, fps: 120, fixedStep: true, debug: false } },
      scene: [scene],
      banner: false,
    });
    gameRef.current = game;
    // Development inspection only; no test routes, synthetic input or game rule changes.
    if (import.meta.env.DEV) window.__MUSEUM_MVP__ = game;
    return () => {
      disposed = true;
      if (window.__MUSEUM_MVP__ === game) delete window.__MUSEUM_MVP__;
      game.destroy(true); gameRef.current = null;
    };
  }, []);

  useEffect(() => {
    const openPoseDemo = event => {
      if (event.code !== 'Space' || event.repeat || !state.hiddenExhibitId) return;
      event.preventDefault();
      if (cameraStatus !== 'ready') return;
      const scene = gameRef.current?.scene.getScene('Room1');
      onPoseDemo(state.hiddenExhibitId, scene?.getResumeState() ?? null);
    };
    window.addEventListener('keydown', openPoseDemo);
    return () => window.removeEventListener('keydown', openPoseDemo);
  }, [cameraStatus, onPoseDemo, state.hiddenExhibitId]);

  return <main className="game-shell">
    <section className="stage-shell" aria-label="Museum Heist 游戏区域">
      <div ref={host} className="game-host" />
      <div className="room-hud gameplay-hud">
        <img className="gameplay-hud-background" src="/stealth-ui/top_hud_background.png" alt="" />
        <div className="gameplay-alert" aria-label={`警戒 ${Math.round(state.alertLevel ?? 0)}%`}>
          <img className="gameplay-siren" src="/stealth-ui/alarm_siren.png" alt="" />
          <span className="gameplay-alert-copy">警戒<strong>{Math.round(state.alertLevel ?? 0)}%</strong></span>
          <div className="gameplay-meter">
            <img src="/stealth-ui/alarm_meter_frame.png" alt="" />
            <img className="gameplay-meter-fill" style={{ clipPath: `inset(0 ${100 - (state.alertLevel ?? 0)}% 0 0)` }} src="/stealth-ui/alarm_meter_fill_segments.png" alt="" />
          </div>
        </div>
        <div className="gameplay-route" aria-label="潜入路线：当前位于第三展厅">
          {[1, 2, 3].map((room) => <div className={`gameplay-room-node ${room === 3 ? 'current' : ''}`} key={room}>
            <img src="/stealth-ui/room_house.png" alt={`第 ${room} 个房间`} />
            {room === 3 && <img className="gameplay-player-marker" src="/stealth-ui/player_marker.png" alt="小偷当前位置" />}
          </div>)}
          <img className="gameplay-treasure" src="/stealth-ui/treasure_chest.png" alt="最终宝箱" />
        </div>
        <button className={`hud-camera ${cameraStatus}`} type="button" onClick={onToggleCamera} disabled={cameraStatus === 'requesting'}>
          {cameraStatus === 'ready' ? '关闭扫描摄像头' : cameraStatus === 'requesting' ? '正在开启…' : cameraStatus === 'error' ? '重试扫描摄像头' : '开启扫描摄像头'}
        </button>
        {cameraError && <span className="hud-camera-error">{cameraError}</span>}
      </div>
      {state.gameOver && <section className="game-over-panel" role="alert">
        <span>GAME OVER</span><strong>你被捕了</strong><button onClick={() => window.location.reload()}>重新开始</button>
      </section>}
      {state.hiddenExhibitId && <p className="room-pose-hint">{cameraStatus === 'ready' ? '安全遮蔽中 · 按空格键开始姿势扫描' : '安全遮蔽中 · 请先点击上方“开启扫描摄像头”'}</p>}
      {!state.ready && <div className="loading-panel" role={state.error ? 'alert' : 'status'}>
        <span className="panel-index">ROOM 01</span>
        <p>{state.error || '正在准备展厅与角色素材…'}</p>
        {state.error && <button onClick={() => window.location.reload()}>重新加载</button>}
      </div>}
    </section>
  </main>;
}

function App() {
  const [activeExhibitId, setActiveExhibitId] = useState(null);
  const [gameOver, setGameOver] = useState(false);
  const [resumeState, setResumeState] = useState(null);
  const cameraStreamRef = useRef(null);
  const [cameraStatus, setCameraStatus] = useState('idle');
  const [cameraError, setCameraError] = useState('');

  const toggleCamera = useCallback(async () => {
    if (cameraStatus === 'requesting') return;
    if (cameraStatus === 'ready') {
      cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
      setCameraError('');
      setCameraStatus('idle');
      return;
    }
    setCameraStatus('requesting');
    setCameraError('');
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('当前浏览器不支持摄像头访问。');
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 1280, height: 720 }, audio: false });
      cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = stream;
      setCameraStatus('ready');
    } catch (error) {
      setCameraError(error?.message || '无法开启摄像头，请检查浏览器权限。');
      setCameraStatus('error');
    }
  }, [cameraStatus]);

  useEffect(() => () => cameraStreamRef.current?.getTracks().forEach((track) => track.stop()), []);

  useEffect(() => {
    if (!activeExhibitId) return undefined;
    const exitPoseDemo = event => {
      if (event.code !== 'Space' || event.repeat) return;
      event.preventDefault();
      setActiveExhibitId(null);
    };
    window.addEventListener('keydown', exitPoseDemo);
    return () => window.removeEventListener('keydown', exitPoseDemo);
  }, [activeExhibitId]);

  if (gameOver) return <main className="game-shell"><section className="stage-shell game-over-stage">
    <section className="game-over-panel" role="alert"><span>GAME OVER</span><strong>你被捕了</strong><button onClick={() => window.location.reload()}>重新开始</button></section>
  </section></main>;

  if (activeExhibitId) return <PoseShadowDemo
    exhibitId={activeExhibitId}
    cameraStream={cameraStreamRef.current}
    alertLevel={resumeState?.alertLevel ?? 0}
    onComplete={(result) => {
      if (result?.success) setResumeState((previous) => previous ? {
        ...previous,
        // A successful statue disguise breaks the guard's lock-on. Room1
        // restarts that guard at its saved position with a new patrol target.
        guard: previous.guard ? { ...previous.guard, mode: 'patrol' } : previous.guard,
      } : previous);
      if (result?.reason === 'timeout') setGameOver(true);
      setActiveExhibitId(null);
    }}
  />;

  return <RoomExperience
    resumeState={resumeState}
    cameraStatus={cameraStatus}
    cameraError={cameraError}
    onToggleCamera={toggleCamera}
    onPoseDemo={(exhibitId, playerState) => {
      setResumeState(playerState);
      setActiveExhibitId(exhibitId);
    }}
  />;
}

createRoot(document.getElementById('root')).render(<App />);

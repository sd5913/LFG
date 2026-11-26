import { publicAsset } from './public-asset.js';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import Phaser from 'phaser';
import Room1 from './game/Room1.js';
import { GAME } from './game/config.js';
import { GameplayHud } from './gameplay-hud.jsx';
import { PoseShadowDemo } from './pose-shadow-demo.jsx';
import { TreasureUnlock } from './treasure-unlock.jsx';
import { StreetEscape } from './street-escape.jsx';
import { DEFAULT_LANGUAGE, LANGUAGE_STORAGE_KEY, normalizeLanguage } from './game-locale.js';
import { GameCamera, useCameraSession, useFrameCamera, useGameCamera } from './use-game-camera.js';
import { GameLanguage, useFrameLanguage, useGameText } from './use-game-language.js';
import './styles.css';

function PipeRoom({ onComplete }) {
  const frameRef = useRef(null);
  const syncLanguage = useFrameLanguage(frameRef);
  const syncCamera = useFrameCamera(frameRef);
  const t = useGameText();
  const [alertLevel, setAlertLevel] = useState(0);

  useEffect(() => {
    const receivePipeMessage = (event) => {
      if (event.origin !== window.location.origin || event.source !== frameRef.current?.contentWindow) return;
      if (event.data?.type === 'lfg:pipe-room-complete') onComplete();
      if (event.data?.type === 'lfg:pipe-room-alert' && Number.isFinite(event.data.alertLevel)) {
        setAlertLevel(Math.min(100, Math.max(0, event.data.alertLevel)));
      }
    };
    window.addEventListener('message', receivePipeMessage);
    return () => window.removeEventListener('message', receivePipeMessage);
  }, [onComplete]);

  return <main className="game-shell">
    <section className="stage-shell pipe-stage-shell" aria-label={t('通风管道潜入', 'Ventilation Tunnels')}>
      <iframe
        ref={frameRef}
        className="pipe-room-frame"
        src={publicAsset('Pipe_Room_demo_v1/index.html')}
        title={t('Museum Heist 第一关：通风管道潜入', 'Museum Heist Stage 1: Ventilation Tunnels')}
        onLoad={() => {
          syncLanguage();
          syncCamera();
          frameRef.current?.focus();
        }}
      />
      <GameplayHud alertLevel={alertLevel} currentRoom={1} onPointerUse={() => frameRef.current?.focus()} />
    </section>
  </main>;
}

function RoomExperience({ onPoseDemo, onTreasureUnlock, resumeState }) {
  const t = useGameText();
  const { status: cameraStatus } = useGameCamera();
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

  const canvasLabel = t('博物馆展厅。用 WASD 或方向键移动，F2 显示碰撞框，R 回到起点。', 'Museum gallery. Use WASD or arrows to move, F2 for collision bounds, and R to return to the entrance.');
  useEffect(() => {
    host.current?.querySelector('canvas')?.setAttribute('aria-label', canvasLabel);
  }, [canvasLabel, state.ready]);

  useEffect(() => {
    const openInteraction = event => {
      if (event.code !== 'Space' || event.repeat || event.target instanceof HTMLButtonElement) return;
      event.preventDefault();
      const scene = gameRef.current?.scene.getScene('Room1');
      if (state.nearTreasure && !state.treasureUnlocked) {
        onTreasureUnlock(scene?.getResumeState() ?? null);
        return;
      }
      if (!state.hiddenExhibitId) return;
      if (cameraStatus !== 'ready') return;
      onPoseDemo(state.hiddenExhibitId, scene?.getResumeState() ?? null);
    };
    window.addEventListener('keydown', openInteraction);
    return () => window.removeEventListener('keydown', openInteraction);
  }, [cameraStatus, onPoseDemo, onTreasureUnlock, state.hiddenExhibitId, state.nearTreasure, state.treasureUnlocked]);

  return <main className="game-shell">
    <section className="stage-shell" aria-label={t('Museum Heist 游戏区域', 'Museum Heist game area')}>
      <div ref={host} className="game-host" />
      <GameplayHud alertLevel={state.alertLevel} currentRoom={3} />
      {state.gameOver && <section className="game-over-panel" role="alert">
        <span>{t('游戏结束', 'GAME OVER')}</span><strong>{t('你被捕了', 'You were caught')}</strong><button onClick={() => window.location.reload()}>{t('重新开始', 'Restart')}</button>
      </section>}
      {state.nearTreasure && !state.treasureUnlocked && <p className="room-pose-hint">{t('宝箱就在前方 · 按空格键开始手势解锁', 'Chest ahead · Press Space to unlock')}</p>}
      {!state.nearTreasure && state.hiddenExhibitId && <p className="room-pose-hint">{cameraStatus === 'ready' ? t('安全遮蔽中 · 按空格键开始姿势扫描', 'In cover · Press Space to scan your pose') : t('安全遮蔽中 · 请先点击上方“开启扫描摄像头”', 'In cover · Enable the camera to scan your pose')}</p>}
      {state.treasureUnlocked && <p className="room-treasure-hint">{t('宝箱已解锁 · 继续前进', 'Chest unlocked · Keep moving')}</p>}
      {!state.ready && <div className="loading-panel" role={state.error ? 'alert' : 'status'}>
        <span className="panel-index">ROOM 01</span>
        <p>{(state.error && t(...state.error)) || t('正在准备展厅与角色素材…', 'Loading the museum gallery…')}</p>
        {state.error && <button onClick={() => window.location.reload()}>{t('重新加载', 'Reload')}</button>}
      </div>}
    </section>
  </main>;
}

function App() {
  const t = useGameText();
  const { stream: cameraStream } = useGameCamera();
  const [stage, setStage] = useState(() => {
    const requested = new URLSearchParams(window.location.search).get('stage');
    return requested === 'museum' || requested === 'escape' ? requested : 'pipe';
  });
  const [activeExhibitId, setActiveExhibitId] = useState(null);
  const [treasureUnlockActive, setTreasureUnlockActive] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [resumeState, setResumeState] = useState(null);

  const enterMuseum = useCallback(() => setStage('museum'), []);

  const enterMuseumFromPipe = useCallback(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('stage', 'museum');
    window.history.replaceState(window.history.state, '', url);
    enterMuseum();
  }, [enterMuseum]);

  const enterStreetEscape = useCallback(() => {
    setResumeState((previous) => previous ? { ...previous, treasureUnlocked: true } : previous);
    setTreasureUnlockActive(false);
    setStage('escape');
  }, []);

  useEffect(() => {
    if (!activeExhibitId) return undefined;
    const exitChallenge = event => {
      if (event.code !== 'Space' || event.repeat || event.target instanceof HTMLButtonElement) return;
      event.preventDefault();
      setActiveExhibitId(null);
    };
    window.addEventListener('keydown', exitChallenge);
    return () => window.removeEventListener('keydown', exitChallenge);
  }, [activeExhibitId]);

  if (gameOver) return <main className="game-shell"><section className="stage-shell game-over-stage">
    <section className="game-over-panel" role="alert"><span>{t('游戏结束', 'GAME OVER')}</span><strong>{t('你被捕了', 'You were caught')}</strong><button onClick={() => window.location.reload()}>{t('重新开始', 'Restart')}</button></section>
    <GameplayHud alertLevel={resumeState?.alertLevel ?? 0} currentRoom={3} />
  </section></main>;

  if (stage === 'pipe') return <PipeRoom onComplete={enterMuseumFromPipe} />;

  if (stage === 'escape') return <StreetEscape
    alertLevel={resumeState?.alertLevel ?? 0}
    onExit={enterMuseum}
  />;

  if (activeExhibitId) return <PoseShadowDemo
    exhibitId={activeExhibitId}
    cameraStream={cameraStream}
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

  if (treasureUnlockActive) return <TreasureUnlock
    cameraStream={cameraStream}
    alertLevel={resumeState?.alertLevel ?? 0}
    onExit={() => setTreasureUnlockActive(false)}
    onComplete={enterStreetEscape}
  />;

  return <RoomExperience
    resumeState={resumeState}
    onPoseDemo={(exhibitId, playerState) => {
      setResumeState(playerState);
      setActiveExhibitId(exhibitId);
    }}
    onTreasureUnlock={(playerState) => {
      setResumeState(playerState);
      setTreasureUnlockActive(true);
    }}
  />;
}

function MuseumHeist() {
  const camera = useCameraSession();
  const [language, setLanguage] = useState(() => {
    try { return normalizeLanguage(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)); }
    catch { return DEFAULT_LANGUAGE; }
  });

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const chooseLanguage = (nextLanguage) => {
    setLanguage(nextLanguage);
    try { window.localStorage.setItem(LANGUAGE_STORAGE_KEY, nextLanguage); }
    catch { /* Language still applies for this session. */ }
  };

  return <GameLanguage.Provider value={{ language, chooseLanguage }}>
    <GameCamera.Provider value={camera}><App /></GameCamera.Provider>
  </GameLanguage.Provider>;
}

createRoot(document.getElementById('root')).render(<MuseumHeist />);

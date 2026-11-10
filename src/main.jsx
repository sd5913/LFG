import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import Phaser from 'phaser';
import Room1 from './game/Room1.js';
import { GAME } from './game/config.js';
import './styles.css';

function App() {
  const host = useRef(null);
  const gameRef = useRef(null);
  const [state, setState] = useState({ ready: false, error: '', moving: false, facing: 'right', debug: false });
  useEffect(() => {
    let disposed = false;
    const scene = new Room1(value => { if (!disposed) setState(value); });
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

  return <main className="game-shell">
    <section className="stage-shell" aria-label="Museum Heist 游戏区域">
      <div ref={host} className="game-host" />
      <div className="room-hud" aria-hidden="true">
        <span className="hud-title">MUSEUM HEIST</span><span className="hud-subtitle">NIGHT SHIFT / MOVEMENT STUDY</span>
        <span className="hud-room">ROOM 01</span><span className="hud-keys">W A S D</span>
        {[1,2,3].map((room,index)=><span className={`hud-node ${index===0?'active':''}`} style={{left:`${68.375+index*8.4375}%`}} key={room}>0{room}</span>)}
      </div>
      {!state.ready && <div className="loading-panel" role={state.error ? 'alert' : 'status'}>
        <span className="panel-index">ROOM 01</span>
        <p>{state.error || '正在准备展厅与角色素材…'}</p>
        {state.error && <button onClick={() => window.location.reload()}>重新加载</button>}
      </div>}
    </section>
  </main>;
}

createRoot(document.getElementById('root')).render(<App />);

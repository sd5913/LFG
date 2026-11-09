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
  const [focused, setFocused] = useState(false);
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

  const command = name => {
    const scene = gameRef.current?.scene.getScene('Room1');
    if (scene?.player) { scene[name](); scene.focusCanvas(); }
  };
  const directionNames = { up: '上', down: '下', left: '左', right: '右' };

  return <main className="workbench">
    <header className="page-header">
      <div className="identity"><span className="project-mark" aria-hidden="true">M / H</span><div><h1>Museum Heist</h1><p>博物馆大盗 · 第一间房移动原型</p></div></div>
      <span className="build-label"><i aria-hidden="true" /> MOVEMENT MVP / 01</span>
    </header>
    <section className="stage-shell" aria-label="Museum Heist 游戏区域">
      <div ref={host} className="game-host" onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} />
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
    <footer className="control-strip">
      <div className="keyboard-help"><div className="keycaps" aria-hidden="true"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></div><p>移动<span>也支持方向键 · 松开即停</span></p></div>
      <p className="movement-status" aria-live="polite">{state.ready ? `${focused ? (state.moving ? '移动中' : '已就位') : '点击画面后使用键盘'} · 朝向${directionNames[state.facing]}` : '素材加载中'}</p>
      <div className="tools"><button disabled={!state.ready} aria-pressed={state.debug} onClick={() => command('toggleDebug')}>{state.debug ? '隐藏碰撞框' : '显示碰撞框'} <span>F2</span></button><button disabled={!state.ready} onClick={() => command('resetPlayer')}>回到起点 <span>R</span></button></div>
    </footer>
    <p className="scope-note">本轮验证移动、朝向与碰撞。展柜可以绕行；保安与姿势挑战将在后续接入。</p>
  </main>;
}

createRoot(document.getElementById('root')).render(<App />);

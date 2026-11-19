import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createStreetRoute, MODULE_TYPES, STREET_SPEED } from './street-route.js';

const VIEW_WIDTH = 1600;
const VIEW_HEIGHT = 900;
const PLAYER_SPAWN = 540;
const GRAVITY = 1600;
const SMALL_JUMP_VELOCITY = -620;
const BIG_JUMP_VELOCITY = -810;
const HOLD_THRESHOLD = 190;

const obstacleArt = {
  [MODULE_TYPES.SHORT_JUMP]: '/street-escape/jump-short-barricade.png',
  [MODULE_TYPES.LONG_JUMP]: '/street-escape/jump-long-road-gap.png',
  [MODULE_TYPES.SHORT_CROUCH]: '/street-escape/crouch-short-awning.png',
  [MODULE_TYPES.LONG_CROUCH]: '/street-escape/crouch-long-scaffold.png',
};

const moduleLabel = {
  [MODULE_TYPES.EMPTY]: '恢复区',
  [MODULE_TYPES.SHORT_JUMP]: '短按 Space · 越过路障',
  [MODULE_TYPES.LONG_JUMP]: '长按 Space · 跃过断路',
  [MODULE_TYPES.SHORT_CROUCH]: '短按 Control · 低身穿过',
  [MODULE_TYPES.LONG_CROUCH]: '长按 Control · 持续低身',
};

// Art scale intentionally differs from the timing module: collision ranges
// govern gameplay while these compact foreground pieces match the scene scale.
const artMetrics = {
  [MODULE_TYPES.SHORT_JUMP]: { width: 168 },
  [MODULE_TYPES.LONG_JUMP]: { width: 292 },
  [MODULE_TYPES.SHORT_CROUCH]: { width: 224 },
  [MODULE_TYPES.LONG_CROUCH]: { width: 550 },
};

const routeCards = [
  { type: MODULE_TYPES.EMPTY, label: '安全跑动' },
  { type: MODULE_TYPES.SHORT_JUMP, label: '短跳路障' },
  { type: MODULE_TYPES.LONG_JUMP, label: '长跳断路' },
  { type: MODULE_TYPES.SHORT_CROUCH, label: '短蹲低檐' },
  { type: MODULE_TYPES.LONG_CROUCH, label: '长蹲脚手架' },
];

function freshSeed() {
  return (Date.now() + Math.floor(Math.random() * 0x7fffffff)) >>> 0;
}

function nextInstruction(route, x) {
  return route.modules.find((module) => module.x + module.width > x + 120) ?? null;
}

function buildView(route, runtime) {
  const camera = Math.max(0, Math.min(runtime.x - 420, route.length - VIEW_WIDTH));
  return {
    x: runtime.x,
    y: runtime.y,
    crouching: runtime.crouching,
    facing: runtime.facing,
    phase: runtime.phase,
    elapsed: runtime.elapsed,
    camera,
    instruction: nextInstruction(route, runtime.x),
  };
}

function formatClock(seconds) {
  const whole = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(whole / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`;
}

export function StreetEscape({ onExit, alertLevel = 0 }) {
  const routeRef = useRef(createStreetRoute(freshSeed()));
  const runtimeRef = useRef({ x: PLAYER_SPAWN, y: 0, velocityY: 0, crouching: false, facing: 'right', elapsed: 0, phase: 'running', lastPaint: 0 });
  const heldRef = useRef({ spaceAt: null, controlAt: null });
  const [route, setRoute] = useState(routeRef.current);
  const [view, setView] = useState(() => buildView(routeRef.current, runtimeRef.current));

  const restart = useCallback(() => {
    const nextRoute = createStreetRoute(freshSeed());
    routeRef.current = nextRoute;
    runtimeRef.current = { x: PLAYER_SPAWN, y: 0, velocityY: 0, crouching: false, facing: 'right', elapsed: 0, phase: 'running', lastPaint: 0 };
    heldRef.current = { spaceAt: null, controlAt: null };
    setRoute(nextRoute);
    setView(buildView(nextRoute, runtimeRef.current));
  }, []);

  useEffect(() => {
    const keyDown = (event) => {
      const runtime = runtimeRef.current;
      if (runtime.phase !== 'running') return;
      if (event.code === 'ArrowLeft') { runtime.facing = 'left'; event.preventDefault(); }
      if (event.code === 'ArrowRight') { runtime.facing = 'right'; event.preventDefault(); }
      if (event.code === 'Space' && heldRef.current.spaceAt === null) {
        heldRef.current.spaceAt = performance.now();
        event.preventDefault();
      }
      if ((event.code === 'ControlLeft' || event.code === 'ControlRight') && heldRef.current.controlAt === null) {
        heldRef.current.controlAt = performance.now();
        runtime.crouching = true;
        event.preventDefault();
      }
    };
    const keyUp = (event) => {
      const runtime = runtimeRef.current;
      if (event.code === 'Space' && heldRef.current.spaceAt !== null) {
        const heldFor = performance.now() - heldRef.current.spaceAt;
        heldRef.current.spaceAt = null;
        if (runtime.phase === 'running' && runtime.y === 0) runtime.velocityY = heldFor >= HOLD_THRESHOLD ? BIG_JUMP_VELOCITY : SMALL_JUMP_VELOCITY;
        event.preventDefault();
      }
      if (event.code === 'ControlLeft' || event.code === 'ControlRight') {
        heldRef.current.controlAt = null;
        runtime.crouching = false;
        event.preventDefault();
      }
    };
    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);
    return () => { window.removeEventListener('keydown', keyDown); window.removeEventListener('keyup', keyUp); };
  }, []);

  useEffect(() => {
    let animationFrame;
    let previous = performance.now();
    const animate = (now) => {
      const runtime = runtimeRef.current;
      const activeRoute = routeRef.current;
      const delta = Math.min((now - previous) / 1000, .05);
      previous = now;
      if (runtime.phase === 'running') {
        runtime.elapsed += delta;
        runtime.x += STREET_SPEED * delta;
        runtime.y += runtime.velocityY * delta;
        runtime.velocityY += GRAVITY * delta;
        if (runtime.y >= 0) { runtime.y = 0; runtime.velocityY = 0; }

        for (const module of activeRoute.modules) {
          const collision = module.collision;
          if (!collision || runtime.x < collision.x || runtime.x > collision.x + collision.width) continue;
          const jumpingHeight = -runtime.y;
          const cleared = collision.kind === 'barrier' ? jumpingHeight > 78
            : collision.kind === 'gap' ? jumpingHeight > 125
              : runtime.crouching;
          if (!cleared) { runtime.phase = 'failed'; break; }
        }
        if (runtime.x >= activeRoute.van.triggerX) runtime.phase = 'complete';
      }
      if (now - runtime.lastPaint > 45 || runtime.phase !== 'running') {
        runtime.lastPaint = now;
        setView(buildView(activeRoute, runtime));
      }
      animationFrame = requestAnimationFrame(animate);
    };
    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, []);

  const playerBottom = 27 + ((-view.y) / VIEW_HEIGHT) * 100;
  const progress = Math.min(100, (view.x / route.van.triggerX) * 100);
  const activeInstruction = view.instruction;

  return <main className="escape-app">
    <section className="escape-stage" aria-label="Museum Heist 第三关：街头逃脱">
      <div className="escape-background" style={{ backgroundPositionX: `${-view.camera * .18}px` }} />
      <div className="escape-night-wash" />
      <div className="escape-ground" />
      <img className="escape-start" src="/street-escape/start-museum-service-exit.png" alt="博物馆后勤出口" />

      {route.modules.map((module) => {
        const art = obstacleArt[module.type];
        const collision = module.collision;
        const visualWidth = artMetrics[module.type]?.width ?? module.width;
        const visualCenter = collision ? collision.x + collision.width / 2 : module.x + module.width / 2;
        const left = ((visualCenter - visualWidth / 2 - view.camera) / VIEW_WIDTH) * 100;
        const width = (visualWidth / VIEW_WIDTH) * 100;
        return <React.Fragment key={module.id}>
          {collision?.kind === 'gap' && <div className="escape-gap-void" style={{ left: `${((collision.x - view.camera) / VIEW_WIDTH) * 100}%`, width: `${(collision.width / VIEW_WIDTH) * 100}%` }} aria-hidden="true" />}
          {art && <img className={`escape-obstacle escape-${module.type}`} style={{ left: `${left}%`, width: `${width}%` }} src={art} alt="" />}
        </React.Fragment>;
      })}
      <img className="escape-van" style={{ left: `${((route.van.x - view.camera) / VIEW_WIDTH) * 100}%`, width: `${(300 / VIEW_WIDTH) * 100}%` }} src="/street-escape/end-getaway-van.png" alt="接应面包车" />

      <div className={`escape-player ${view.crouching ? 'crouching' : ''}`} style={{ bottom: `${playerBottom}%` }}>
        <img src={view.facing === 'left' ? '/assets/player/left.png' : '/assets/player/right.png'} alt="正在逃离的小偷" />
      </div>

      <header className="escape-top-hud" aria-label="逃脱状态栏">
        <img className="escape-top-hud-background" src="/stealth-ui/top_hud_background.png" alt="" />
        <div className="escape-alert" aria-label={`警戒 ${Math.round(alertLevel)}%`}>
          <img className="escape-siren" src="/stealth-ui/alarm_siren.png" alt="" />
          <span>警戒<strong>{Math.round(alertLevel)}%</strong></span>
          <div className="escape-meter">
            <img src="/stealth-ui/alarm_meter_frame.png" alt="" />
            <img className="escape-meter-fill" style={{ clipPath: `inset(0 ${100 - alertLevel}% 0 0)` }} src="/stealth-ui/alarm_meter_fill_segments.png" alt="" />
          </div>
        </div>
        <div className="escape-route-hud" aria-label={`逃离进度 ${Math.round(progress)}%`}>
          <img className="escape-route-player" src="/stealth-ui/player_marker.png" alt="小偷" />
          <div className="escape-route-line"><i /><i /><i /><i /></div>
          <img className="escape-route-van" src="/street-escape/end-getaway-van.png" alt="接应车" />
        </div>
        <div className="escape-loot-hud">
          <img src="/stealth-ui/treasure_chest.png" alt="已取得的宝藏" />
          <span><b>{Math.round(progress)}%</b><small>{formatClock(view.elapsed)}</small></span>
          <button type="button" onClick={onExit}>返回展厅</button>
        </div>
      </header>
      <section className="escape-module-cards" aria-label="逃脱操作提示">
        {routeCards.map((card, index) => <article className={`escape-module-card ${activeInstruction?.type === card.type ? 'active' : ''}`} key={card.type}>
          <span>{String(index + 1).padStart(2, '0')}</span>
          {card.type === MODULE_TYPES.EMPTY
            ? <img className="escape-card-player" src="/assets/player/right.png" alt="" />
            : <img src={obstacleArt[card.type]} alt="" />}
          <strong>{card.label}</strong>
        </article>)}
      </section>
      <p className="escape-objective"><b>Space</b> 短按小跳 / 长按大跳　·　<b>Ctrl</b> 短按小蹲 / 长按长蹲　·　{activeInstruction ? moduleLabel[activeInstruction.type] : '接应车就在前方'}</p>

      {view.phase === 'failed' && <section className="escape-result failure" role="alert">
        <span>逃脱中断</span><strong>警卫追上来了</strong><p>这条夜路会重新生成。</p><button type="button" onClick={restart}>重新逃脱</button>
      </section>}
      {view.phase === 'complete' && <section className="escape-result success" role="alert">
        <span>MISSION COMPLETE</span><strong>成功逃离博物馆</strong><p>宝藏已安全装上接应车。</p><button type="button" onClick={restart}>挑战新的逃脱路线</button><button type="button" className="quiet" onClick={onExit}>返回展厅</button>
      </section>}
    </section>
    <p className="escape-note">每次进入都会生成新的单向逃脱路线 · 像素素材使用原始硬边缩放</p>
  </main>;
}

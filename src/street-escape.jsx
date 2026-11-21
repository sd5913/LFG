import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createStreetRoute, MODULE_TYPES, STREET_SPEED } from './street-route.js';

const VIEW_WIDTH = 1600;
const VIEW_HEIGHT = 900;
// The thief begins just outside the service door.  The camera stays still until
// they reach one third of the stage, then scrolls with the route while keeping
// the thief in that screen position.
const PLAYER_SPAWN = 268;
const PLAYER_LOCK_SCREEN_X = VIEW_WIDTH / 3;
const GRAVITY = 1600;
const SMALL_JUMP_VELOCITY = -670;
const BIG_JUMP_VELOCITY = -900;
// Forward impulse is deliberately independent of A/D movement. It makes a
// jump carry the thief over an obstacle instead of only bobbing vertically.
// A small jump should clear the short barricade with a little room to spare,
// rather than carrying the thief across an entire module (about 1.5× the
// 168px visual barricade width at the current gravity/launch velocity).
const SMALL_JUMP_FORWARD_SPEED = 300;
const BIG_JUMP_FORWARD_SPEED = 610;
const DOUBLE_TAP_WINDOW = 280;
const CROUCH_TAP_DURATION = 620;
const GUARD_ENTRY_DELAY = 5;
const GUARD_SPEED = 214;
const GUARD_CATCH_DISTANCE = 72;
const isControlInput = (event) => event.key === 'Control' || event.code === 'Control' || event.code === 'ControlLeft' || event.code === 'ControlRight';
// These are deliberately named after the supplied action references:
// attachment one = Space jump, attachment two = Control crouch.
const JUMP_PLAYER_ART = '/assets/player-actions/jump.png';
const CROUCH_PLAYER_ART = '/assets/player-actions/crouch.png';

const obstacleArt = {
  [MODULE_TYPES.SHORT_JUMP]: '/street-escape/jump-short-barricade.png',
  [MODULE_TYPES.LONG_JUMP]: '/street-escape/jump-long-road-gap.png',
  [MODULE_TYPES.SHORT_CROUCH]: '/street-escape/crouch-short-awning.png',
  [MODULE_TYPES.LONG_CROUCH]: '/street-escape/crouch-long-scaffold.png',
};

const moduleLabel = {
  [MODULE_TYPES.EMPTY]: '恢复区',
  [MODULE_TYPES.SHORT_JUMP]: 'Space 起跳 · 越过路障',
  [MODULE_TYPES.LONG_JUMP]: '双击 Space · 大跳越过断路',
  [MODULE_TYPES.SHORT_CROUCH]: 'Control 下蹲 · 穿过低檐',
  [MODULE_TYPES.LONG_CROUCH]: 'Control 下蹲 · 通过脚手架',
};

// Art scale intentionally differs from the timing module: collision ranges
// govern gameplay while these compact foreground pieces match the scene scale.
const artMetrics = {
  [MODULE_TYPES.SHORT_JUMP]: { width: 168 },
  [MODULE_TYPES.LONG_JUMP]: { width: 292 },
  [MODULE_TYPES.SHORT_CROUCH]: { width: 224 },
  [MODULE_TYPES.LONG_CROUCH]: { width: 550 },
};

function freshSeed() {
  return (Date.now() + Math.floor(Math.random() * 0x7fffffff)) >>> 0;
}

function nextInstruction(route, x) {
  return route.modules.find((module) => module.x + module.width > x + 120) ?? null;
}

function buildView(route, runtime) {
  const camera = Math.max(0, Math.min(runtime.x - PLAYER_LOCK_SCREEN_X, route.length - VIEW_WIDTH));
  return {
    x: runtime.x,
    y: runtime.y,
    crouching: runtime.crouching,
    facing: runtime.facing,
    phase: runtime.phase,
    elapsed: runtime.elapsed,
    guardX: runtime.guardX,
    guardActive: runtime.guardActive,
    camera,
    instruction: nextInstruction(route, runtime.x),
  };
}

function formatClock(seconds) {
  const whole = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(whole / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`;
}

function createEscapeRuntime() {
  // The guard has a fixed five-second entrance. It then runs slightly faster
  // than the thief, keeping the pressure predictable on every random route.
  return { x: PLAYER_SPAWN, y: 0, velocityY: 0, jumpVelocityX: 0, crouching: false, facing: 'right', guardX: null, guardActive: false, elapsed: 0, phase: 'running', lastPaint: 0 };
}

function launchJump(runtime, velocityY, forwardSpeed) {
  runtime.velocityY = velocityY;
  runtime.jumpVelocityX = forwardSpeed;
}

export function StreetEscape({ onExit, alertLevel = 0 }) {
  const routeRef = useRef(createStreetRoute(freshSeed()));
  const runtimeRef = useRef(createEscapeRuntime());
  const heldRef = useRef({ lastSpaceAt: 0, controlHeld: false, crouchUntil: 0, left: false, right: false });
  const [route, setRoute] = useState(routeRef.current);
  const [view, setView] = useState(() => buildView(routeRef.current, runtimeRef.current));

  const restart = useCallback(() => {
    const nextRoute = createStreetRoute(freshSeed());
    routeRef.current = nextRoute;
    runtimeRef.current = createEscapeRuntime();
    heldRef.current = { lastSpaceAt: 0, controlHeld: false, crouchUntil: 0, left: false, right: false };
    setRoute(nextRoute);
    setView(buildView(nextRoute, runtimeRef.current));
  }, []);

  useEffect(() => {
    const keyDown = (event) => {
      const runtime = runtimeRef.current;
      if (runtime.phase !== 'running') return;
      if (event.code === 'KeyA') { heldRef.current.left = true; runtime.facing = 'left'; event.preventDefault(); }
      if (event.code === 'KeyD') { heldRef.current.right = true; runtime.facing = 'right'; event.preventDefault(); }
      if (event.code === 'Space' && !event.repeat) {
        const now = performance.now();
        const isDoubleTap = now - heldRef.current.lastSpaceAt <= DOUBLE_TAP_WINDOW;
        heldRef.current.lastSpaceAt = now;
        // The first press reacts immediately. A second quick press upgrades
        // that live jump, so a double tap is still recognized after takeoff.
        if (isDoubleTap && runtime.y <= 0) launchJump(runtime, BIG_JUMP_VELOCITY, BIG_JUMP_FORWARD_SPEED);
        else if (runtime.y === 0) launchJump(runtime, SMALL_JUMP_VELOCITY, SMALL_JUMP_FORWARD_SPEED);
        event.preventDefault();
      }
      if (isControlInput(event) && !event.repeat) {
        const now = performance.now();
        heldRef.current.controlHeld = true;
        // A tap deliberately holds the crouch briefly, so Ctrl works both as
        // an ordinary key press and as a held low-profile action.
        heldRef.current.crouchUntil = now + CROUCH_TAP_DURATION;
        runtime.crouching = true;
        event.preventDefault();
      }
    };
    const keyUp = (event) => {
      const runtime = runtimeRef.current;
      if (event.code === 'KeyA') { heldRef.current.left = false; event.preventDefault(); }
      if (event.code === 'KeyD') { heldRef.current.right = false; event.preventDefault(); }
      if (event.code === 'Space') event.preventDefault();
      if (isControlInput(event)) {
        heldRef.current.controlHeld = false;
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
        runtime.crouching = heldRef.current.controlHeld || now < heldRef.current.crouchUntil;
        runtime.elapsed += delta;
        const direction = heldRef.current.right ? 1 : heldRef.current.left ? -1 : 0;
        const jumpBoost = runtime.y < 0 || runtime.velocityY < 0 ? runtime.jumpVelocityX : 0;
        runtime.x = Math.max(PLAYER_SPAWN, runtime.x + (direction * STREET_SPEED + jumpBoost) * delta);
        if (!runtime.guardActive && runtime.elapsed >= GUARD_ENTRY_DELAY) {
          runtime.guardActive = true;
          runtime.guardX = runtime.x - 500;
        }
        if (runtime.guardActive) runtime.guardX += GUARD_SPEED * delta;
        runtime.y += runtime.velocityY * delta;
        runtime.velocityY += GRAVITY * delta;
        if (runtime.y >= 0) { runtime.y = 0; runtime.velocityY = 0; runtime.jumpVelocityX = 0; }

        for (const module of activeRoute.modules) {
          const collision = module.collision;
          if (!collision || runtime.x < collision.x || runtime.x > collision.x + collision.width) continue;
          const jumpingHeight = -runtime.y;
          const cleared = collision.kind === 'barrier' ? jumpingHeight > 50
            : collision.kind === 'gap' ? jumpingHeight > 90
              : runtime.crouching;
          if (!cleared) { runtime.phase = 'failed'; break; }
        }
        if (runtime.guardActive && runtime.guardX >= runtime.x - GUARD_CATCH_DISTANCE) runtime.phase = 'caught';
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
  const progress = Math.min(100, Math.max(0, ((view.x - PLAYER_SPAWN) / (route.van.triggerX - PLAYER_SPAWN)) * 100));
  const activeInstruction = view.instruction;
  const playerArt = view.crouching
    ? CROUCH_PLAYER_ART
    : view.y < 0
      ? JUMP_PLAYER_ART
      : view.facing === 'left' ? '/assets/player/left.png' : '/assets/player/right.png';

  return <main className="escape-app">
    <section className="escape-stage" aria-label="Museum Heist 第三关：街头逃脱">
      <div className="escape-background" style={{ backgroundPositionX: `${-view.camera * .18}px` }} />
      <div className="escape-night-wash" />
      <img className="escape-start" style={{ left: `${((42 - view.camera) / VIEW_WIDTH) * 100}%` }} src="/street-escape/start-museum-service-exit.png" alt="博物馆后勤出口" />

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

      <div
        className={`escape-player ${view.crouching ? 'crouching' : ''} ${view.y < 0 ? 'jumping' : ''}`}
        style={{
          left: `${((view.x - view.camera) / VIEW_WIDTH) * 100}%`,
          bottom: `${playerBottom}%`,
        }}
      >
        <img src={playerArt} alt="正在逃离的小偷" />
      </div>
      {view.guardActive && <div className="escape-guard" style={{ left: `${((view.guardX - view.camera) / VIEW_WIDTH) * 100}%` }}>
        <img src="/assets/guard/right.png" alt="正在追赶的保安" />
      </div>}

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
      <p className="escape-objective"><b>A / D</b> 移动　·　<b>Space</b> 起跳 / 双击大跳　·　<b>Ctrl</b> 下蹲　·　{activeInstruction ? moduleLabel[activeInstruction.type] : '接应车就在前方'}</p>

      {(view.phase === 'failed' || view.phase === 'caught') && <section className="escape-result failure" role="alert">
        <span>逃脱中断</span><strong>警卫追上来了</strong><p>这条夜路会重新生成。</p><button type="button" onClick={restart}>重新逃脱</button>
      </section>}
      {view.phase === 'complete' && <section className="escape-result success" role="alert">
        <span>MISSION COMPLETE</span><strong>成功逃离博物馆</strong><p>宝藏已安全装上接应车。</p><button type="button" onClick={restart}>挑战新的逃脱路线</button><button type="button" className="quiet" onClick={onExit}>返回展厅</button>
      </section>}
    </section>
    <p className="escape-note">每次进入都会生成新的单向逃脱路线 · 像素素材使用原始硬边缩放</p>
  </main>;
}

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createStreetRoute, fallsIntoStreetGap, MODULE_TYPES, ROAD_GAP_ART_WIDTH, ROAD_GAP_LEFT_LIP, ROAD_GAP_RIGHT_LIP, SHORT_BARRICADE_ART_WIDTH, STREET_PLAYER_SPAWN, STREET_SPEED } from './street-route.js';
import { advanceStreetJump, allowsStreetJump, isStreetCrouching, jumpOnSpacePress, pressStreetCrouch } from './street-jump.js';
import { advanceStreetChase } from './street-chase.js';

const VIEW_WIDTH = 1600;
const VIEW_HEIGHT = 900;
// The 317×302 road tile is cropped from the 2172px-wide gap artwork.
const ROAD_TILE_SCALE = ROAD_GAP_ART_WIDTH / 2172;
const ROAD_TILE_SOURCE_TOP = 367;
const ROAD_TILE_WIDTH = 317 * ROAD_TILE_SCALE;
const ROAD_TILE_HEIGHT = 302 * ROAD_TILE_SCALE;
// The thief begins just outside the service door.  The camera stays still until
// they reach one third of the stage, then scrolls with the route while keeping
// the thief in that screen position.
const PLAYER_LOCK_SCREEN_X = VIEW_WIDTH / 3;
const isControlInput = (event) => event.key === 'Control' || event.code === 'Control' || event.code === 'ControlLeft' || event.code === 'ControlRight';
// These are deliberately named after the supplied action references:
// attachment one = Space jump, attachment two = Control crouch.
const JUMP_PLAYER_ART = '/assets/player-actions/jump.png';
const CROUCH_PLAYER_ART = '/assets/player-actions/crouch.png';
const movementDirection = ({ left, right }) => Number(right) - Number(left);
const isSpaceInput = ({ code, key }) => code === 'Space' || key === ' ';

function createHeldInputs() {
  return { controlHeld: false, crouchOnLanding: false, crouchUntil: 0, left: false, right: false };
}

const moduleLabel = {
  [MODULE_TYPES.SHORT_JUMP]: 'Space 起跳 · 越过路障',
  [MODULE_TYPES.LONG_JUMP]: '连按 Space · 大跳越过断路',
  [MODULE_TYPES.SHORT_CROUCH]: 'Control 下蹲 · 穿过低檐',
  [MODULE_TYPES.LONG_CROUCH]: 'Control 下蹲 · 通过脚手架',
};

// Measure the PNG padding below each solid base separately from its collision.
const obstacleArt = {
  [MODULE_TYPES.SHORT_JUMP]: { src: '/street-escape/jump-short-barricade.png', width: SHORT_BARRICADE_ART_WIDTH, sourceWidth: 1536, bottomPadding: 249 },
  [MODULE_TYPES.SHORT_CROUCH]: { src: '/street-escape/crouch-short-awning.png', width: 224, sourceWidth: 1536, bottomPadding: 218 },
  [MODULE_TYPES.LONG_CROUCH]: { src: '/street-escape/crouch-long-scaffold.png', width: 550, sourceWidth: 2172, bottomPadding: 196 },
};

function groundedArtStyle({ width, sourceWidth, bottomPadding }) {
  return {
    width: `${(width / VIEW_WIDTH) * 100}%`,
    '--ground-offset': `${(bottomPadding * width / sourceWidth / VIEW_HEIGHT) * 100}%`,
  };
}

const START_ART_STYLE = groundedArtStyle({ width: 192, sourceWidth: 1312, bottomPadding: 103 });
const VAN_ART_STYLE = groundedArtStyle({ width: 300, sourceWidth: 1774, bottomPadding: 93 });

function freshSeed() {
  return (Date.now() + Math.floor(Math.random() * 0x7fffffff)) >>> 0;
}

function nextInstruction(route, x) {
  return route.modules.find(({ collision }) => collision.x + collision.width >= x) ?? null;
}

function buildView(route, runtime) {
  const camera = Math.max(0, Math.min(runtime.x - PLAYER_LOCK_SCREEN_X, route.length - VIEW_WIDTH));
  return {
    x: runtime.x,
    y: runtime.y,
    crouching: runtime.crouching,
    bigJump: runtime.jump?.big ?? false,
    facing: runtime.facing,
    phase: runtime.phase,
    elapsed: runtime.elapsed,
    guardX: runtime.guard.x,
    camera,
    instruction: nextInstruction(route, runtime.x),
  };
}

function formatClock(seconds) {
  const whole = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(whole / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`;
}

function RoadGap({ collision, camera }) {
  const position = (x) => `${((x - camera) / VIEW_WIDTH) * 100}%`;
  const artStyle = {
    width: `${(ROAD_GAP_ART_WIDTH / VIEW_WIDTH) * 100}%`,
    top: `calc(var(--road-top) - ${(ROAD_TILE_SOURCE_TOP * ROAD_TILE_SCALE / VIEW_HEIGHT) * 100}%)`,
  };
  const art = '/street-escape/jump-long-road-gap.png';
  // Align the ledges to the tile's source row. The road tiles extend up to the
  // warning posts, and the clipped artwork supplies the posts and broken edges.
  return <>
    <div className="escape-gap-void" style={{ left: position(collision.x), width: `${(collision.width / VIEW_WIDTH) * 100}%` }} aria-hidden="true" />
    <img className="escape-obstacle escape-long-jump escape-gap-left" style={{ ...artStyle, left: position(collision.x - ROAD_GAP_LEFT_LIP) }} src={art} alt="" />
    <img className="escape-obstacle escape-long-jump escape-gap-right" style={{ ...artStyle, left: position(collision.x + collision.width - ROAD_GAP_RIGHT_LIP) }} src={art} alt="" />
  </>;
}

function createEscapeRuntime() {
  return {
    x: STREET_PLAYER_SPAWN, y: 0, jump: null, crouching: false, facing: 'right',
    guard: { x: null },
    elapsed: 0, phase: 'running', lastPaint: 0,
  };
}

export function StreetEscape({ onExit, alertLevel = 0 }) {
  const routeRef = useRef(createStreetRoute(freshSeed()));
  const runtimeRef = useRef(createEscapeRuntime());
  const heldRef = useRef(createHeldInputs());
  const [route, setRoute] = useState(routeRef.current);
  const [view, setView] = useState(() => buildView(routeRef.current, runtimeRef.current));

  const restart = useCallback(() => {
    const nextRoute = createStreetRoute(freshSeed());
    routeRef.current = nextRoute;
    runtimeRef.current = createEscapeRuntime();
    heldRef.current = createHeldInputs();
    setRoute(nextRoute);
    setView(buildView(nextRoute, runtimeRef.current));
  }, []);

  useEffect(() => {
    for (const src of [JUMP_PLAYER_ART, CROUCH_PLAYER_ART]) new Image().src = src;

    const keyDown = (event) => {
      const runtime = runtimeRef.current;
      if (runtime.phase !== 'running') return;
      if (event.code === 'KeyA') { heldRef.current.left = true; runtime.facing = 'left'; event.preventDefault(); }
      if (event.code === 'KeyD') { heldRef.current.right = true; runtime.facing = 'right'; event.preventDefault(); }
      if (isSpaceInput(event)) {
        event.preventDefault();
        if (allowsStreetJump(heldRef.current, event.repeat)) runtime.jump = jumpOnSpacePress(runtime);
      }
      if (isControlInput(event) && !event.repeat) {
        event.preventDefault();
        pressStreetCrouch(heldRef.current, runtime.jump, performance.now());
      }
    };
    const keyUp = (event) => {
      if (event.code === 'KeyA') { heldRef.current.left = false; event.preventDefault(); }
      if (event.code === 'KeyD') { heldRef.current.right = false; event.preventDefault(); }
      if (isSpaceInput(event)) event.preventDefault();
      if (isControlInput(event)) {
        heldRef.current.controlHeld = false;
        event.preventDefault();
      }
    };
    const resetHeldInputs = () => {
      heldRef.current = createHeldInputs();
      const jump = runtimeRef.current.jump;
      if (jump) jump.nextJumpQueued = false;
    };
    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);
    window.addEventListener('blur', resetHeldInputs);
    return () => {
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
      window.removeEventListener('blur', resetHeldInputs);
    };
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
        const held = heldRef.current;
        const direction = movementDirection(held);
        if (runtime.elapsed > 0 || direction > 0) runtime.elapsed += delta;
        let groundTime = delta;
        let airDistance = 0;
        let nextJumpQueued = false;
        if (runtime.jump) {
          const step = advanceStreetJump(runtime.jump, delta, direction);
          runtime.y = -step.height;
          airDistance = step.distance;
          groundTime = step.groundTime;
          if (step.landed) {
            nextJumpQueued = runtime.jump.nextJumpQueued;
            runtime.jump = null;
          }
        }
        const groundDistance = direction * STREET_SPEED * groundTime;
        const groundStartX = Math.max(STREET_PLAYER_SPAWN, runtime.x + airDistance);
        runtime.x = Math.max(STREET_PLAYER_SPAWN, groundStartX + groundDistance);
        runtime.crouching = isStreetCrouching(held, runtime.jump, now);
        for (const { collision } of activeRoute.modules) {
          if (collision.kind === 'gap') {
            if (fallsIntoStreetGap(collision, groundStartX, runtime.x, runtime.jump !== null)) {
              runtime.phase = 'fell';
              break;
            }
            continue;
          }
          if (runtime.x < collision.x || runtime.x > collision.x + collision.width) continue;
          const jumpingHeight = -runtime.y;
          const cleared = collision.kind === 'barrier' ? jumpingHeight > 50 : runtime.crouching;
          if (!cleared) { runtime.phase = 'failed'; break; }
        }
        if (runtime.phase === 'running') {
          const caught = advanceStreetChase(runtime.guard, runtime.x, -runtime.y, runtime.elapsed);
          if (caught) runtime.phase = 'caught';
          else if (runtime.x >= activeRoute.van.triggerX) runtime.phase = 'complete';
          else if (nextJumpQueued && !runtime.crouching) runtime.jump = jumpOnSpacePress(runtime);
        }
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
  const roadOffset = -((view.camera % ROAD_TILE_WIDTH) / (VIEW_WIDTH - ROAD_TILE_WIDTH)) * 100;
  const progress = Math.min(100, Math.max(0, ((view.x - STREET_PLAYER_SPAWN) / (route.van.triggerX - STREET_PLAYER_SPAWN)) * 100));
  const activeInstruction = view.instruction;
  const playerArt = view.y < 0
    ? JUMP_PLAYER_ART
    : view.crouching
      ? CROUCH_PLAYER_ART
      : view.facing === 'left' ? '/assets/player/left.png' : '/assets/player/right.png';

  return <main className="escape-app">
    <section className="escape-stage" aria-label="Museum Heist 第三关：街头逃脱">
      <div className="escape-background" style={{ backgroundPositionX: `${-view.camera * .18}px` }} />
      <div className="escape-night-wash" />
      <div className="escape-road" style={{
        height: `${(ROAD_TILE_HEIGHT / VIEW_HEIGHT) * 100}%`,
        backgroundSize: `${(ROAD_TILE_WIDTH / VIEW_WIDTH) * 100}% 100%`,
        backgroundPositionX: `${roadOffset}%`,
      }} aria-hidden="true" />
      <img className="escape-start" style={{ ...START_ART_STYLE, left: `${((42 - view.camera) / VIEW_WIDTH) * 100}%` }} src="/street-escape/start-museum-service-exit.png" alt="博物馆后勤出口" />

      {route.modules.map((module) => {
        const collision = module.collision;
        if (collision.kind === 'gap') return <RoadGap key={module.id} collision={collision} camera={view.camera} />;

        const art = obstacleArt[module.type];
        const visualLeft = collision.x + (collision.width - art.width) / 2;
        const left = ((visualLeft - view.camera) / VIEW_WIDTH) * 100;
        return <img key={module.id} className="escape-obstacle" style={{ ...groundedArtStyle(art), left: `${left}%` }} src={art.src} alt="" />;
      })}
      <img className="escape-van" style={{ ...VAN_ART_STYLE, left: `${((route.van.x - view.camera) / VIEW_WIDTH) * 100}%` }} src="/street-escape/end-getaway-van.png" alt="接应面包车" />

      <div
        className={`escape-player facing-${view.facing} ${view.crouching ? 'crouching' : ''} ${view.y < 0 ? 'jumping' : ''}`}
        style={{
          left: `${((view.x - view.camera) / VIEW_WIDTH) * 100}%`,
          bottom: `${playerBottom}%`,
        }}
      >
        <img src={playerArt} alt="正在逃离的小偷" />
      </div>
      {view.guardX !== null && <img className="escape-guard" style={{ left: `${((view.guardX - view.camera) / VIEW_WIDTH) * 100}%` }} src="/assets/guard/right.png" alt="正在追赶的保安" />}

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
      <p className="escape-objective"><b>A / D</b> 移动　·　<b>Space</b> 起跳 / 连按大跳　·　<b>Ctrl</b> 下蹲　·　{view.bigJump && <b>大跳已触发　·　</b>}{activeInstruction ? moduleLabel[activeInstruction.type] : '接应车就在前方'}</p>

      {(view.phase === 'failed' || view.phase === 'fell' || view.phase === 'caught') && <section className="escape-result failure" role="alert">
        <span>逃脱中断</span><strong>{view.phase === 'fell' ? '掉进断路了' : view.phase === 'caught' ? '被抓捕' : '撞上障碍了'}</strong><p>这条夜路会重新生成。</p><button type="button" onClick={restart}>重新逃脱</button>
      </section>}
      {view.phase === 'complete' && <section className="escape-result success" role="alert">
        <span>MISSION COMPLETE</span><strong>成功逃离博物馆</strong><p>宝藏已安全装上接应车。</p><button type="button" onClick={restart}>挑战新的逃脱路线</button><button type="button" className="quiet" onClick={onExit}>返回展厅</button>
      </section>}
    </section>
    <p className="escape-note">每次进入都会生成新的单向逃脱路线 · 像素素材使用原始硬边缩放</p>
  </main>;
}

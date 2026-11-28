import { publicAsset } from './public-asset.js';
import { useFrameCamera, useGameCamera } from './use-game-camera.js';
import { Cutscene } from './cutscene.jsx';
import { useFrameLanguage, useGameText } from './use-game-language.js';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createStreetRoute, fallsIntoStreetGap, MODULE_TYPES, ROAD_GAP_ART_WIDTH, ROAD_GAP_LEFT_LIP, ROAD_GAP_RIGHT_LIP, SHORT_BARRICADE_ART_WIDTH, STREET_PLAYER_SPAWN, STREET_SPEED } from './street-route.js';
import { advanceStreetJump, allowsStreetJump, isStreetCrouching, jumpOnSpacePress, pressStreetCrouch } from './street-jump.js';
import { advanceStreetPursuit, createStreetGuard, recoverFromStreetObstacle, settleStreetChallenge, STREET_MAX_ALERT } from './street-chase.js';

const VIEW_WIDTH = 1600;
const VIEW_HEIGHT = 900;
const VIEW_UPDATE_INTERVAL_MS = 1000 / 30;
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
const JUMP_PLAYER_ART = publicAsset('assets/player-actions/jump.png');
const CROUCH_PLAYER_ART = publicAsset('assets/player-actions/crouch.png');
const movementDirection = ({ left, right }) => Number(right) - Number(left);
const isSpaceInput = ({ code, key }) => code === 'Space' || key === ' ';

function createHeldInputs() {
  return { controlHeld: false, crouchOnLanding: false, crouchUntil: 0, left: false, right: false };
}

const moduleLabel = {
  [MODULE_TYPES.SHORT_JUMP]: ['Space 起跳 · 越过路障', 'Space · Jump the barricade'],
  [MODULE_TYPES.LONG_JUMP]: ['连按 Space · 大跳越过断路', 'Tap Space twice · Jump the gap'],
  [MODULE_TYPES.SHORT_CROUCH]: ['Control 下蹲 · 穿过低檐', 'Ctrl · Duck under the awning'],
  [MODULE_TYPES.LONG_CROUCH]: ['Control 下蹲 · 通过脚手架', 'Ctrl · Duck under the scaffolding'],
};

// Measure the PNG padding below each solid base separately from its collision.
const obstacleArt = {
  [MODULE_TYPES.SHORT_JUMP]: { src: publicAsset('street-escape/jump-short-barricade.png'), width: SHORT_BARRICADE_ART_WIDTH, sourceWidth: 1536, bottomPadding: 249 },
  [MODULE_TYPES.SHORT_CROUCH]: { src: publicAsset('street-escape/crouch-short-awning.png'), width: 224, sourceWidth: 1536, bottomPadding: 218 },
  [MODULE_TYPES.LONG_CROUCH]: { src: publicAsset('street-escape/crouch-long-scaffold.png'), width: 550, sourceWidth: 2172, bottomPadding: 196 },
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

function overlapsStreetObstacle(x, obstacle) {
  return x >= obstacle.x && x <= obstacle.x + obstacle.width;
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
    alertLevel: runtime.alertLevel,
    lastChallengeOutcome: runtime.lastChallengeOutcome,
    guardX: runtime.guard.x,
    guardStunned: runtime.elapsed < (runtime.guard.stunnedUntil ?? 0),
    camera,
    instruction: nextInstruction(route, runtime.x),
  };
}

function RoadGap({ collision, camera }) {
  const position = (x) => `${((x - camera) / VIEW_WIDTH) * 100}%`;
  const artStyle = {
    width: `${(ROAD_GAP_ART_WIDTH / VIEW_WIDTH) * 100}%`,
    top: `calc(var(--road-top) - ${(ROAD_TILE_SOURCE_TOP * ROAD_TILE_SCALE / VIEW_HEIGHT) * 100}%)`,
  };
  const art = publicAsset('street-escape/jump-long-road-gap.png');
  // Align the ledges to the tile's source row. The road tiles extend up to the
  // warning posts, and the clipped artwork supplies the posts and broken edges.
  return <>
    <div className="escape-gap-void" style={{ left: position(collision.x), width: `${(collision.width / VIEW_WIDTH) * 100}%` }} aria-hidden="true" />
    <img className="escape-obstacle escape-long-jump escape-gap-left" style={{ ...artStyle, left: position(collision.x - ROAD_GAP_LEFT_LIP) }} src={art} alt="" />
    <img className="escape-obstacle escape-long-jump escape-gap-right" style={{ ...artStyle, left: position(collision.x + collision.width - ROAD_GAP_RIGHT_LIP) }} src={art} alt="" />
  </>;
}

function createEscapeRuntime(initialAlertLevel, route) {
  const alertLevel = Math.min(STREET_MAX_ALERT, Math.max(0, initialAlertLevel));
  return {
    x: STREET_PLAYER_SPAWN, y: 0, jump: null, crouching: false, facing: 'right',
    guard: createStreetGuard(route),
    alertLevel, lastChallengeOutcome: null,
    hitObstacle: null, recoveryUntil: 0,
    elapsed: 0, phase: alertLevel === STREET_MAX_ALERT ? 'arrested' : 'running', lastPaint: 0,
  };
}

export function StreetEscape({ onExit, alertLevel = 0 }) {
  const t = useGameText();
  const [route, setRoute] = useState(() => createStreetRoute(freshSeed()));
  const routeRef = useRef(route);
  const runtimeRef = useRef(null);
  runtimeRef.current ??= createEscapeRuntime(alertLevel, routeRef.current);
  const heldRef = useRef(createHeldInputs());
  const challengeRef = useRef(null);
  const syncChallengeLanguage = useFrameLanguage(challengeRef);
  const stageRef = useRef(null);
  const { status: cameraStatus } = useGameCamera();
  const cameraRequestingRef = useRef(false);
  const [view, setView] = useState(() => buildView(routeRef.current, runtimeRef.current));
  const [endingFinished, setEndingFinished] = useState(false);
  const inChallenge = view.phase === 'challenge';
  const syncChallengeCamera = useFrameCamera(challengeRef, inChallenge);

  useEffect(() => {
    cameraRequestingRef.current = cameraStatus === 'requesting';
    if (cameraRequestingRef.current) heldRef.current = createHeldInputs();
  }, [cameraStatus]);

  const restart = useCallback(() => {
    const nextRoute = createStreetRoute(freshSeed());
    routeRef.current = nextRoute;
    runtimeRef.current = createEscapeRuntime(alertLevel, nextRoute);
    heldRef.current = createHeldInputs();
    setEndingFinished(false);
    setRoute(nextRoute);
    setView(buildView(nextRoute, runtimeRef.current));
  }, [alertLevel]);

  useEffect(() => {
    const finishChallenge = (event) => {
      const runtime = runtimeRef.current;
      if (event.origin !== window.location.origin ||
          event.source !== challengeRef.current?.contentWindow || event.data?.type !== 'street-rps-result') return;

      if (!settleStreetChallenge(runtime, event.data.outcome)) return;
      if (runtime.phase === 'running' && runtime.crouching) {
        pressStreetCrouch(heldRef.current, null, performance.now());
        heldRef.current.controlHeld = false;
      }
      setView(buildView(routeRef.current, runtime));
    };
    window.addEventListener('message', finishChallenge);
    return () => window.removeEventListener('message', finishChallenge);
  }, []);

  useEffect(() => {
    if (view.guardStunned || view.phase === 'arrested') stageRef.current?.focus();
  }, [view.guardStunned, view.phase]);

  useEffect(() => {
    for (const src of [JUMP_PLAYER_ART, CROUCH_PLAYER_ART]) new Image().src = src;

    const keyDown = (event) => {
      const runtime = runtimeRef.current;
      const running = runtime.phase === 'running';
      if ((!running && runtime.phase !== 'recovering') || cameraRequestingRef.current || event.target instanceof HTMLButtonElement) return;
      if (event.code === 'KeyA') { heldRef.current.left = true; runtime.facing = 'left'; event.preventDefault(); }
      if (event.code === 'KeyD') { heldRef.current.right = true; runtime.facing = 'right'; event.preventDefault(); }
      if (isSpaceInput(event)) {
        if (event.target instanceof HTMLButtonElement) return;
        event.preventDefault();
        if (running && allowsStreetJump(heldRef.current, event.repeat)) runtime.jump = jumpOnSpacePress(runtime);
      }
      if (isControlInput(event) && !event.repeat) {
        event.preventDefault();
        if (running) pressStreetCrouch(heldRef.current, runtime.jump, performance.now());
        else heldRef.current.controlHeld = true;
      }
    };
    const keyUp = (event) => {
      if (event.code === 'KeyA') { heldRef.current.left = false; event.preventDefault(); }
      if (event.code === 'KeyD') { heldRef.current.right = false; event.preventDefault(); }
      if (isSpaceInput(event) && !(event.target instanceof HTMLButtonElement)) event.preventDefault();
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
    let paintedPhase = runtimeRef.current.phase;
    const animate = (now) => {
      const runtime = runtimeRef.current;
      const activeRoute = routeRef.current;
      const delta = Math.min((now - previous) / 1000, .05);
      previous = now;
      const active = runtime.phase === 'running' || runtime.phase === 'recovering';
      if (active && !cameraRequestingRef.current) {
        const held = heldRef.current;
        const direction = movementDirection(held);
        if (runtime.elapsed > 0 || direction > 0) runtime.elapsed += delta;
        let nextJumpQueued = false;
        if (runtime.phase === 'running') {
          let groundTime = delta;
          let airDistance = 0;
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
          if (runtime.hitObstacle && !overlapsStreetObstacle(runtime.x, runtime.hitObstacle)) runtime.hitObstacle = null;
          for (const { collision } of activeRoute.modules) {
            if (collision.kind === 'gap') {
              if (fallsIntoStreetGap(collision, groundStartX, runtime.x, runtime.jump !== null)) {
                runtime.phase = 'fell';
                break;
              }
              continue;
            }
            if (collision === runtime.hitObstacle || !overlapsStreetObstacle(runtime.x, collision)) continue;
            const cleared = collision.kind === 'barrier' ? -runtime.y > 50 : runtime.crouching;
            if (!cleared) {
              recoverFromStreetObstacle(runtime, collision);
              held.crouchOnLanding = false;
              held.crouchUntil = 0;
              break;
            }
          }
        }
        if (runtime.phase !== 'fell') {
          advanceStreetPursuit(runtime);
          if (runtime.phase === 'challenge') {
            heldRef.current = createHeldInputs();
            if (runtime.jump) runtime.jump.nextJumpQueued = false;
          } else if (runtime.phase === 'running') {
            if (runtime.x >= activeRoute.van.triggerX) runtime.phase = 'complete';
            else if (nextJumpQueued && !runtime.crouching) runtime.jump = jumpOnSpacePress(runtime);
          }
        }
      }
      if (runtime.phase !== paintedPhase || (active && now - runtime.lastPaint >= VIEW_UPDATE_INTERVAL_MS)) {
        paintedPhase = runtime.phase;
        runtime.lastPaint = now;
        setView(buildView(activeRoute, runtime));
      }
      animationFrame = requestAnimationFrame(animate);
    };
    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, []);

  if (view.phase === 'complete' && !endingFinished) return <Cutscene
    file="02-getaway-van.mp4"
    label={['结尾动画：搭上接应车', 'Ending: Leaving in the getaway van']}
    onComplete={() => setEndingFinished(true)}
  />;

  const recovering = view.phase === 'recovering';
  const playerBottom = 27 + ((-view.y) / VIEW_HEIGHT) * 100;
  const roadOffset = -((view.camera % ROAD_TILE_WIDTH) / (VIEW_WIDTH - ROAD_TILE_WIDTH)) * 100;
  const activeInstruction = view.instruction;
  const playerArt = view.y < 0
    ? JUMP_PLAYER_ART
    : view.crouching
      ? CROUCH_PLAYER_ART
      : view.facing === 'left' ? publicAsset('assets/player/left.png') : publicAsset('assets/player/right.png');

  const scene = inChallenge ? (
    <iframe
      ref={challengeRef}
      className="escape-guard-challenge"
      src={publicAsset('rock-paper-scissors-demo/index.html')}
      title={t('保安追击 · 三回合石头剪刀布', 'Guard chase · Three rounds of rock, paper, scissors')}
      onLoad={(event) => {
        const frame = event.currentTarget;
        syncChallengeLanguage();
        frame.focus();
        syncChallengeCamera();
      }}
    />
  ) : (
    <>
      <div className="escape-background" style={{ backgroundPositionX: `${-view.camera * .18}px` }} />
      <div className="escape-night-wash" />
      <div className="escape-road" style={{
        height: `${(ROAD_TILE_HEIGHT / VIEW_HEIGHT) * 100}%`,
        backgroundSize: `${(ROAD_TILE_WIDTH / VIEW_WIDTH) * 100}% 100%`,
        backgroundPositionX: `${roadOffset}%`,
      }} aria-hidden="true" />
      <img className="escape-start" style={{ ...START_ART_STYLE, left: `${((42 - view.camera) / VIEW_WIDTH) * 100}%` }} src={publicAsset('street-escape/start-museum-service-exit.png')} alt={t('博物馆后勤出口', 'Museum service exit')} />

      {route.modules.map((module) => {
        const collision = module.collision;
        if (collision.kind === 'gap') return <RoadGap key={module.id} collision={collision} camera={view.camera} />;

        const art = obstacleArt[module.type];
        const visualLeft = collision.x + (collision.width - art.width) / 2;
        const left = ((visualLeft - view.camera) / VIEW_WIDTH) * 100;
        return <img key={module.id} className="escape-obstacle" style={{ ...groundedArtStyle(art), left: `${left}%` }} src={art.src} alt="" />;
      })}
      <img className="escape-van" style={{ ...VAN_ART_STYLE, left: `${((route.van.x - view.camera) / VIEW_WIDTH) * 100}%` }} src={publicAsset('street-escape/end-getaway-van.png')} alt={t('接应面包车', 'Getaway van')} />

      <div
        className={`escape-player facing-${view.facing} ${view.crouching ? 'crouching' : ''} ${view.y < 0 ? 'jumping' : ''} ${recovering ? 'recovering' : ''}`}
        style={{
          left: `${((view.x - view.camera) / VIEW_WIDTH) * 100}%`,
          bottom: `${playerBottom}%`,
        }}
      >
        <img src={playerArt} alt={t('正在逃离的小偷', 'Thief on the run')} />
      </div>
      {view.guardX !== null && <img className="escape-guard" style={{ left: `${((view.guardX - view.camera) / VIEW_WIDTH) * 100}%` }} src={publicAsset('assets/guard/right.png')} alt={t('正在追赶的保安', 'Guard in pursuit')} />}

      <p className="escape-objective">
        <b>A / D</b> {t('移动', 'Move')} · <b>Space</b> {t('起跳 / 连按大跳', 'Jump / double-tap for a high jump')} · <b>Ctrl</b> {t('下蹲', 'Duck')} ·{' '}
        {recovering ? <b role="status">{t('撞上障碍 · 警戒 +30% · 恢复中', 'Obstacle hit · Alert +30% · Recovering')}</b> : <>
          {view.guardStunned && <b role="status">{view.lastChallengeOutcome === 'lose' ? t('警戒上升，快跑！', 'Alert increased. Run!') : t('保安已被制住，快跑！', 'Guard stunned. Run!')}　·　</b>}
          {view.bigJump && <b>{t('大跳已触发　·　', 'High jump　·　')}</b>}
          {activeInstruction ? t(...moduleLabel[activeInstruction.type]) : t('接应车就在前方', 'Getaway van ahead')}
        </>}
      </p>

      {(view.phase === 'fell' || view.phase === 'arrested') && <section className="escape-result failure" role="alert">
        <span>{t('逃脱中断', 'Escape interrupted')}</span><strong>{view.phase === 'fell' ? t('掉进断路了', 'You fell into the gap') : t('小偷被逮捕', 'You were caught')}</strong><p>{t('这条夜路会重新生成。', 'A new route will be generated.')}</p><button type="button" onClick={restart}>{t('重新逃脱', 'Try again')}</button>
      </section>}
      {view.phase === 'complete' && <section className="escape-result success" role="alert">
        <span>{t('任务完成', 'MISSION COMPLETE')}</span><strong>{t('成功逃离博物馆', 'You escaped the museum')}</strong><p>{t('宝藏已安全装上接应车。', 'The treasure is safely in the getaway van.')}</p><button type="button" onClick={restart}>{t('挑战新的逃脱路线', 'Try a new route')}</button><button type="button" className="quiet" onClick={onExit}>{t('返回展厅', 'Back to gallery')}</button>
      </section>}
    </>
  );

  return <main className="escape-app">
    <section ref={stageRef} className="escape-stage" tabIndex={-1} aria-label={t('Museum Heist 第三关：街头逃脱', 'Museum Heist Stage 3: Street Escape')}>
      {scene}
    </section>
  </main>;
}

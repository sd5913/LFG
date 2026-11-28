import React, { createContext, useContext, useLayoutEffect, useRef, useState } from 'react';
import { publicAsset } from './public-asset.js';
import { useGameText } from './use-game-language.js';

const MOVE_DURATION = 1000;
const TRAVEL_END = 0.8;
// Each center remains 12.6% of the HUD apart; trim the unused outer space.
const ROUTE_WIDTH = 28.85;
const NODE_SPACING = (12.6 / ROUTE_WIDTH) * 100;
const positions = [50 - NODE_SPACING, 50, 50 + NODE_SPACING];
const nodes = [
  { name: ['管道', 'Pipe'], file: 'progress_pipe.png' },
  { name: ['展厅', 'Room'], file: 'progress_room.png' },
  { name: ['宝箱', 'Treasure'], file: 'progress_treasure.png' },
];
// Artwork bounds within the supplied PNGs (ignoring near-transparent outer pixels).
const artBounds = {
  'progress_pipe.png': [1536, 1024, 184, 207, 1168, 635],
  'progress_room.png': [1254, 1254, 197, 253, 860, 725],
  'progress_treasure.png': [1254, 1254, 227, 352, 799, 614],
  'progress_thief.png': [1254, 1254, 314, 287, 626, 763],
};
const RouteTransition = createContext(null);

// The App remains mounted across scene switches. Only presentation timing lives here.
export function ProgressNavigationProvider({ node, onSelect, children }) {
  const [transition, setTransition] = useState(() => ({
    from: node, to: node, startedAt: 0,
  }));
  useLayoutEffect(() => {
    if (transition.to === node) return;
    setTransition({
      from: node > transition.to ? transition.to : node,
      to: node,
      startedAt: performance.now(),
    });
  }, [node, transition.to]);
  return <RouteTransition.Provider value={{ ...transition, onSelect }}>{children}</RouteTransition.Provider>;
}

function RouteArt({ file, alt, className = '' }) {
  const [sourceWidth, sourceHeight, x, y, width, height] = artBounds[file];
  return <div className={className} style={{ aspectRatio: `${width} / ${height}` }}>
    <img src={publicAsset(`stealth-ui/${file}`)} alt={alt} style={{
      width: `${sourceWidth / width * 100}%`,
      height: `${sourceHeight / height * 100}%`,
      left: `${-x / width * 100}%`,
      top: `${-y / height * 100}%`,
    }} />
  </div>;
}

export function ProgressNavigation() {
  const t = useGameText();
  const transition = useContext(RouteTransition);
  const markerRef = useRef(null);
  const fillRef = useRef(null);
  const currentRef = useRef(null);
  const { from, to, startedAt } = transition ?? { from: 0, to: 0, startedAt: 0 };
  const start = positions[from];
  const end = positions[to];

  useLayoutEffect(() => {
    if (from === to || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const elapsed = performance.now() - startedAt;
    if (elapsed >= MOVE_DURATION) return;
    const animations = [];
    const animate = (element, keyframes) => {
      if (!element) return;
      const animation = element.animate(keyframes, { duration: MOVE_DURATION, fill: 'both' });
      animation.currentTime = elapsed;
      animations.push(animation);
    };
    animate(markerRef.current, [
      { left: `${start}%`, transform: 'translateX(-50%)', easing: 'cubic-bezier(.22,.7,.25,1)' },
      { left: `${end}%`, transform: 'translateX(-50%)', offset: TRAVEL_END, easing: 'ease-out' },
      { left: `${end}%`, transform: 'translate(-50%, -12%)', offset: .9, easing: 'ease-in' },
      { left: `${end}%`, transform: 'translateX(-50%)' },
    ]);
    animate(fillRef.current, [
      { width: `${start - positions[0]}%`, easing: 'cubic-bezier(.22,.7,.25,1)' },
      { width: `${end - positions[0]}%`, offset: TRAVEL_END },
      { width: `${end - positions[0]}%` },
    ]);
    animate(currentRef.current, [
      { filter: 'brightness(.76)', offset: 0 },
      { filter: 'brightness(.76)', offset: TRAVEL_END - .03 },
      { filter: 'brightness(1.2) drop-shadow(0 0 7px #ffd77b)', offset: .88 },
      { filter: 'drop-shadow(0 0 3px #e9bd67)' },
    ]);
    return () => animations.forEach(animation => animation.cancel());
  }, [from, to, startedAt, start, end]);

  return <div className="gameplay-route" style={{ width: `${ROUTE_WIDTH}%` }} role="group" aria-label={t('关卡进度', 'Stage progress')}>
    <div className="gameplay-route-line" style={{ left: `${positions[0]}%`, width: `${positions[2] - positions[0]}%` }} aria-hidden="true" />
    <div ref={fillRef} className="gameplay-route-fill" style={{ left: `${positions[0]}%`, width: `${end - positions[0]}%` }} aria-hidden="true" />
    {nodes.map((node, index) => (
      <button key={node.file} type="button" className={`gameplay-progress-node ${index === to ? 'current' : index < to ? 'complete' : 'locked'}`}
        style={{ left: `${positions[index]}%` }} aria-current={index === to ? 'step' : undefined}
        aria-label={t(`测试跳转：${node.name[0]}`, `Test stage: ${node.name[1]}`)}
        onClick={() => transition?.onSelect?.(index)} ref={index === to ? currentRef : null}>
        <RouteArt className={`gameplay-progress-art progress-art-${index}`} file={node.file} alt={t(...node.name)} />
      </button>
    ))}
    <div ref={markerRef} className="gameplay-player-marker" style={{ left: `${end}%` }}>
      <RouteArt className="gameplay-progress-art progress-art-thief" file="progress_thief.png" alt={t('小偷当前位置', 'Thief’s current stage')} />
    </div>
  </div>;
}

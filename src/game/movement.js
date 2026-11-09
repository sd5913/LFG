export const KEY_DIRECTIONS = Object.freeze({
  KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
});

export function movementIntent(pressedCodes, pressOrder, speed, previousFacing) {
  const directions = new Set([...pressedCodes].map(code => KEY_DIRECTIONS[code]).filter(Boolean));
  const dx = Number(directions.has('right')) - Number(directions.has('left'));
  const dy = Number(directions.has('down')) - Number(directions.has('up'));
  if (dx === 0 && dy === 0) return { vx: 0, vy: 0, facing: previousFacing };
  const length = Math.hypot(dx, dy);
  const active = new Set([
    ...(dx ? [dx > 0 ? 'right' : 'left'] : []),
    ...(dy ? [dy > 0 ? 'down' : 'up'] : []),
  ]);
  const facing = [...pressOrder].reverse().map(code => KEY_DIRECTIONS[code])
    .find(direction => active.has(direction)) ?? [...active][0];
  return { vx: dx * speed / length, vy: dy * speed / length, facing };
}

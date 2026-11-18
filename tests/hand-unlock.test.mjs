import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateUnlockGesture } from '../src/hand-unlock/recognize.js';

function pose(lw, rw) {
  const points = Array.from({ length: 33 }, () => ({ x: .5, y: .5, visibility: 1 }));
  Object.assign(points[11], { x: .4, y: .35 }); Object.assign(points[12], { x: .6, y: .35 });
  Object.assign(points[13], { x: .32, y: .49 }); Object.assign(points[14], { x: .68, y: .49 });
  Object.assign(points[15], { x: lw[0], y: lw[1] }); Object.assign(points[16], { x: rw[0], y: rw[1] });
  return points;
}
const hand = Array.from({ length: 21 }, (_, i) => ({ x: .2 + i * .002, y: .3 + i * .002 }));

test('two visible hands distinguish the three reference poses', () => {
  assert.equal(evaluateUnlockGesture(pose([.47,.47],[.53,.47]), [hand], 'TOGETHER').matched, true);
  assert.equal(evaluateUnlockGesture(pose([.27,.35],[.73,.35]), [hand,hand], 'SPREAD').matched, true);
  assert.equal(evaluateUnlockGesture(pose([.59,.47],[.41,.47]), [hand,hand], 'CROSS').matched, true);
});

test('no hands or hidden body joints cannot advance the lock', () => {
  assert.equal(evaluateUnlockGesture(pose([.47,.47],[.53,.47]), [], 'TOGETHER').matched, false);
  const hidden = pose([.59,.47],[.41,.47]); hidden[15].visibility = .1;
  assert.equal(evaluateUnlockGesture(hidden, [hand,hand], 'CROSS').matched, false);
});

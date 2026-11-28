import test from 'node:test';
import assert from 'node:assert/strict';
import { UnlockMachine } from '../src/unlock-machine.js';

const rad = degrees => degrees * Math.PI / 180;
const finalStep = () => {
  const machine = new UnlockMachine();
  machine.stepIndex = 3;
  return machine;
};

test('fist rotations accumulate to 80 degrees across a tracking interruption', () => {
  const machine = finalStep();
  machine.update({ gesture: 'FIST', angle: rad(170), now: 0 });
  assert.equal(machine.update({ gesture: 'FIST', angle: rad(-160), now: 100 }).rotationDegrees, 30);
  machine.update({ gesture: 'NONE', now: 500 });
  assert.equal(machine.update({ gesture: 'FIST', angle: rad(-140), now: 600 }).rotationDegrees, 30);
  assert.equal(machine.update({ gesture: 'FIST', angle: rad(-100), now: 700 }).unlocked, false);
  assert.equal(machine.update({ gesture: 'FIST', angle: rad(-90), now: 800 }).unlocked, true);
});

test('the opposite direction works and an open hand cannot unlock', () => {
  const machine = finalStep();
  machine.update({ gesture: 'FIST', angle: rad(20), now: 0 });
  assert.equal(machine.update({ gesture: 'OPEN', angle: rad(-40), now: 100 }).unlocked, false);
  assert.equal(machine.update({ gesture: 'FIST', angle: rad(-30), now: 200 }).rotationDegrees, 0);
  assert.equal(machine.update({ gesture: 'FIST', angle: rad(10), now: 300 }).rotationDegrees, 40);
  assert.equal(machine.update({ gesture: 'FIST', angle: rad(-30), now: 400 }).unlocked, true);
});

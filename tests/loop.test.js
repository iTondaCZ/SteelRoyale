import test from 'node:test';
import assert from 'node:assert/strict';
import { stepsForFrame } from '../js/loop.js';

const TICK = 1 / 60;

test('one 60 Hz frame gives exactly one step', () => {
  const r = stepsForFrame(0, 1 / 60, TICK);
  assert.equal(r.steps, 1);
  assert.ok(r.accumulator < 1e-6);
});

test('a long hitch is capped and the extra time is dropped', () => {
  const r = stepsForFrame(0, 0.5, TICK, 5);
  assert.equal(r.steps, 5);
  assert.ok(r.accumulator < TICK);
});

test('fractions carry over between frames', () => {
  let acc = 0;
  let total = 0;
  for (let i = 0; i < 144; i++) {
    const r = stepsForFrame(acc, 1 / 144, TICK);
    acc = r.accumulator;
    total += r.steps;
  }
  assert.ok(total === 59 || total === 60, `got ${total}`);
});

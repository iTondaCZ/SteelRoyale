import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../js/sim/rng.js';
import { boltPaths, MAX_BOLT_POINTS, MAX_BOLT_SEGMENTS } from '../js/render/bolt-paths.js';

const top = { x: 10, y: 200, z: -40 };
const ground = { x: 0, y: 6, z: -30 };
const near = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < 1e-9;

test('a bolt runs from the cloud to exactly the strike point, with forks off the main channel', () => {
  const paths = boltPaths(createRng(3), top, ground);
  const main = paths[0];
  assert.ok(near(main.points[0], top));
  assert.ok(near(main.points[main.points.length - 1], ground));
  assert.ok(main.points.length > 60, 'the main channel is finely jagged');
  assert.ok(paths.length >= 4, 'there are branches');
  for (const b of paths.slice(1)) {
    const start = b.points[0];
    const end = b.points[b.points.length - 1];
    assert.ok(
      paths.some((p) => p !== b && p.points.some((q) => near(q, start))),
      'every branch starts on the channel it forks from',
    );
    assert.ok(end.y < start.y, 'branches head down');
    assert.ok(end.y > ground.y - 1, 'branches stop above the ground');
    assert.ok(b.width < main.width && b.bright < main.bright, 'branches are thinner and dimmer');
  }
});

test('the main channel wanders sideways but never strays far from the line between its ends', () => {
  const main = boltPaths(createRng(9), top, ground)[0].points;
  let maxOff = 0;
  for (const p of main) {
    const t = (top.y - p.y) / (top.y - ground.y);
    const cx = top.x + (ground.x - top.x) * t;
    const cz = top.z + (ground.z - top.z) * t;
    maxOff = Math.max(maxOff, Math.hypot(p.x - cx, p.z - cz));
  }
  assert.ok(maxOff > 3, `jagged (max offset ${maxOff.toFixed(1)} m)`);
  assert.ok(maxOff < 0.35 * (top.y - ground.y), `still a bolt, not a scribble (max offset ${maxOff.toFixed(1)} m)`);
});

test('no bolt is ever bigger than the fixed GPU buffers', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const paths = boltPaths(createRng(seed), top, ground);
    const points = paths.reduce((s, p) => s + p.points.length, 0);
    const segments = paths.reduce((s, p) => s + p.points.length - 1, 0);
    assert.ok(points <= MAX_BOLT_POINTS, `seed ${seed}: ${points} points`);
    assert.ok(segments <= MAX_BOLT_SEGMENTS, `seed ${seed}: ${segments} segments`);
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { circleBoxPush, rayBox, raySphere, rayCapsule } from '../js/sim/collision.js';
import { createGrid } from '../js/sim/spatial-grid.js';

const box = { minX: 0, minY: 0, minZ: 0, maxX: 2, maxY: 2, maxZ: 2 };
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

test('circle overlapping a face is pushed out to exactly r from that face', () => {
  const p = circleBoxPush(-0.2, 1, 0.5, box);
  assert.ok(near(p.x, -0.3));
  assert.ok(near(p.z, 0));
});

test('circle not touching the box returns null', () => {
  assert.equal(circleBoxPush(-0.6, 1, 0.5, box), null);
});

test('circle near a corner is pushed diagonally', () => {
  const p = circleBoxPush(-0.2, -0.2, 0.5, box);
  const d = Math.hypot(-0.2 + p.x - 0, -0.2 + p.z - 0);
  assert.ok(near(d, 0.5, 1e-9));
  assert.ok(p.x < 0 && p.z < 0);
});

test('circle centre inside box exits on the shallowest axis', () => {
  const p = circleBoxPush(1.9, 1, 0.5, box);
  assert.ok(near(p.x, 0.6));
  assert.equal(p.z, 0);
});

test('ray hits the nearest face at the right t', () => {
  assert.ok(near(rayBox({ x: -5, y: 1, z: 1 }, { x: 1, y: 0, z: 0 }, box), 5));
  assert.ok(near(rayBox({ x: 1, y: 10, z: 1 }, { x: 0, y: -1, z: 0 }, box), 8));
});

test('ray misses when parallel outside, pointing away, or too short', () => {
  assert.equal(rayBox({ x: -5, y: 3, z: 1 }, { x: 1, y: 0, z: 0 }, box), null);
  assert.equal(rayBox({ x: -5, y: 1, z: 1 }, { x: -1, y: 0, z: 0 }, box), null);
  assert.equal(rayBox({ x: -5, y: 1, z: 1 }, { x: 1, y: 0, z: 0 }, box, 4), null);
});

test('ray starting inside a box returns 0', () => {
  assert.equal(rayBox({ x: 1, y: 1, z: 1 }, { x: 1, y: 0, z: 0 }, box), 0);
});

test('raySphere hits front surface and misses beside it', () => {
  const c = { x: 0, y: 0, z: 0 };
  assert.ok(near(raySphere({ x: -5, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, c, 1), 4));
  assert.equal(raySphere({ x: -5, y: 1.5, z: 0 }, { x: 1, y: 0, z: 0 }, c, 1), null);
  assert.equal(raySphere({ x: 5, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, c, 1), null);
});

test('rayCapsule hits the side, the cap, and misses above', () => {
  const a = { x: 0, y: 0, z: 0 };
  const b = { x: 0, y: 2, z: 0 };
  const d = { x: 1, y: 0, z: 0 };
  assert.ok(near(rayCapsule({ x: -5, y: 1, z: 0 }, d, a, b, 0.5), 4.5, 1e-9));
  assert.ok(near(rayCapsule({ x: -5, y: 2.3, z: 0 }, d, a, b, 0.5), 4.6, 1e-9));
  assert.equal(rayCapsule({ x: -5, y: 3, z: 0 }, d, a, b, 0.5), null);
  // ray along the axis (parallel) still hits the bottom cap
  assert.ok(near(rayCapsule({ x: 0, y: -5, z: 0 }, { x: 0, y: 1, z: 0 }, a, b, 0.5), 4.5, 1e-9));
});

test('grid query returns each overlapping box exactly once', () => {
  const g = createGrid(4);
  const big = { minX: -10, minY: 0, minZ: -10, maxX: 10, maxY: 1, maxZ: 10 };
  const small = { minX: 20, minY: 0, minZ: 20, maxX: 21, maxY: 1, maxZ: 21 };
  g.insert(big);
  g.insert(small);
  const hits = g.query(-1, -1, 1, 1);
  assert.deepEqual(hits, [big]);
  g.remove(big);
  assert.deepEqual(g.query(-1, -1, 1, 1), []);
});

test('grid alongRay visits boxes along the ray and stops after the best hit', () => {
  const g = createGrid(4);
  const a = { minX: 10, minY: 0, minZ: -1, maxX: 11, maxY: 2, maxZ: 1 };
  const b = { minX: 30, minY: 0, minZ: -1, maxX: 31, maxY: 2, maxZ: 1 };
  const off = { minX: 10, minY: 0, minZ: 20, maxX: 11, maxY: 2, maxZ: 21 };
  [a, b, off].forEach((x) => g.insert(x));
  const seen = [];
  const o = { x: 0, y: 1, z: 0 };
  const d = { x: 1, y: 0, z: 0 };
  let best = Infinity;
  g.alongRay(0, 0, 1, 0, 100, (bx) => {
    seen.push(bx);
    const t = rayBox(o, d, bx, best);
    if (t !== null && t < best) best = t;
    return best;
  });
  assert.ok(seen.includes(a));
  assert.ok(!seen.includes(off));
  assert.ok(!seen.includes(b), 'should stop before reaching the far box');
  assert.ok(near(best, 10));
});

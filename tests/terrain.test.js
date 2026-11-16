import test from 'node:test';
import assert from 'node:assert/strict';
import { createTerrain } from '../js/sim/terrain.js';

const heightFn = (x, z) => Math.sin(x * 0.3) * 3 + z * 0.1;
const make = () => createTerrain({ size: 40, cellSize: 2, heightFn });
const near = (a, b, eps = 1e-5) => Math.abs(a - b) < eps;

test('heightFn is sampled at vertex positions', () => {
  const t = make();
  assert.equal(t.cols, 21);
  assert.ok(near(t.heights[0], heightFn(-20, -20)));
  assert.ok(near(t.heights[t.cols * 3 + 4], heightFn(-12, -14)));
});

test('heightAt at a vertex equals the stored height', () => {
  const t = make();
  const i = 7 * t.cols + 5; // ix=5 -> x=-10, iz=7 -> z=-6
  assert.ok(near(t.heightAt(-10, -6), t.heights[i]));
});

test('cell midpoint lies between neighbouring vertex heights', () => {
  const t = make();
  const i = 7 * t.cols + 5;
  const hs = [t.heights[i], t.heights[i + 1], t.heights[i + t.cols], t.heights[i + t.cols + 1]];
  const h = t.heightAt(-9, -5);
  assert.ok(h >= Math.min(...hs) - 1e-6 && h <= Math.max(...hs) + 1e-6);
});

test('flatten makes every point inside the zone equal h', () => {
  const t = make();
  t.flatten(0, 0, 10, 6, 5, 4);
  for (let x = -5; x <= 5; x += 0.37) {
    for (let z = -3; z <= 3; z += 0.41) {
      assert.ok(near(t.heightAt(x, z), 5), `at ${x},${z} got ${t.heightAt(x, z)}`);
    }
  }
});

test('flatten blends smoothly instead of leaving the rest untouched', () => {
  const t = make();
  const before = t.heightAt(-19, 0);
  t.flatten(0, 0, 10, 6, 5, 4);
  // far away from the zone nothing changes
  assert.ok(near(t.heightAt(-19, 0), before));
});

test('points outside the map clamp to the edge', () => {
  const t = make();
  assert.ok(near(t.heightAt(100, 0), t.heightAt(20, 0)));
  assert.ok(near(t.heightAt(0, -500), t.heightAt(0, -20)));
});

test('maxHeight tracks the highest vertex', () => {
  const t = make();
  assert.ok(near(t.maxHeight, Math.max(...t.heights)));
  t.flatten(0, 0, 4, 4, 50, 2);
  assert.ok(near(t.maxHeight, 50));
});

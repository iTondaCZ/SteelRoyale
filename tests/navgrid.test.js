import test from 'node:test';
import assert from 'node:assert/strict';
import { createTerrain } from '../js/sim/terrain.js';
import { createWorld } from '../js/sim/world.js';
import { buildNavGrid, findPath, lineWalkable, isWalkable } from '../js/sim/navgrid.js';
import { generateBuilding, pieceBoxes } from '../js/sim/buildings.js';

const flatWorld = () => createWorld(createTerrain({ size: 120, cellSize: 2, heightFn: () => 0 }));
const box = (minX, minY, minZ, maxX, maxY, maxZ) => ({ minX, minY, minZ, maxX, maxY, maxZ });

function checkPath(nav, path) {
  for (let i = 1; i < path.length; i++) {
    assert.ok(lineWalkable(nav, path[i - 1].x, path[i - 1].z, path[i].x, path[i].z), `segment ${i} crosses a wall`);
  }
}

test('a path goes around a wall', () => {
  const w = flatWorld();
  w.addBox(box(-20, 0, -0.2, 20, 3, 0.2));
  const nav = buildNavGrid(w);
  assert.equal(isWalkable(nav, 0, 0), false);
  const path = findPath(nav, 0, -10, 0, 10);
  assert.ok(path && path.length >= 3);
  checkPath(nav, path);
  const end = path[path.length - 1];
  assert.ok(Math.hypot(end.x - 0, end.z - 10) < 1.5);
});

test('low steps and overhead roofs do not block', () => {
  const w = flatWorld();
  w.addBox(box(-5, 0, -5, 5, 0.3, 5)); // low platform
  w.addBox(box(-5, 3.5, 6, 5, 3.8, 16)); // roof overhead
  const nav = buildNavGrid(w);
  assert.equal(isWalkable(nav, 0, 0), true);
  assert.equal(isWalkable(nav, 0, 10), true);
});

test('a path enters a building through its doorway', () => {
  const w = flatWorld();
  // Half-metre origin, as mapgen places buildings.
  const b = generateBuilding({ kind: 'house', originX: -5.5, originZ: -5.5, baseY: 0.05, cellsX: 3, cellsZ: 3, floors: 1, doorSides: [2], rng: () => 0.99 });
  for (const p of b.pieces) for (const bx of pieceBoxes(p)) w.addBox(bx);
  const nav = buildNavGrid(w);
  const doorX = -5.5 + 1.5 * 4;
  const doorZ = -5.5 + 3 * 4;
  assert.equal(isWalkable(nav, doorX, doorZ), true, 'doorway cell is open');
  assert.equal(isWalkable(nav, doorX + 1.2, doorZ), false, 'wall beside the door is blocked');
  assert.equal(isWalkable(nav, doorX - 4, doorZ), false, 'plain wall is blocked');
  const path = findPath(nav, 0.5, 20, 0.5, -2);
  assert.ok(path, 'should find a way in');
  checkPath(nav, path);
  const end = path[path.length - 1];
  assert.ok(Math.hypot(end.x - 0.5, end.z + 2) < 1.5, 'reaches the inside');
});

test('an enclosed area returns a path that gets as close as possible', () => {
  const w = flatWorld();
  w.addBox(box(-4, 0, -4, 4, 3, -3.6));
  w.addBox(box(-4, 0, 3.6, 4, 3, 4));
  w.addBox(box(-4, 0, -4, -3.6, 3, 4));
  w.addBox(box(3.6, 0, -4, 4, 3, 4));
  const nav = buildNavGrid(w);
  const path = findPath(nav, 20, 0, 0, 0);
  if (path) {
    const end = path[path.length - 1];
    assert.ok(Math.hypot(end.x, end.z) >= 3, 'must not pass through walls');
    checkPath(nav, path);
  }
});

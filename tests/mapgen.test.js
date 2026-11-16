import test from 'node:test';
import assert from 'node:assert/strict';
import { generateMap, pickSpawnPoints } from '../js/sim/mapgen.js';
import { createRng } from '../js/sim/rng.js';
import { MATCH } from '../js/config.js';

const t0 = performance.now();
const map = generateMap({ seed: 1234, size: 1200, players: 100 });
const genMs = performance.now() - t0;

test('the full map generates in reasonable time', () => {
  assert.ok(genMs < 4000, `took ${genMs.toFixed(0)} ms`);
});

test('the island has named places with buildings, chests, loot, trees and rocks', () => {
  assert.ok(map.places.length >= 6, `places: ${map.places.length}`);
  assert.ok(new Set(map.places.map((p) => p.name)).size === map.places.length, 'unique names');
  assert.ok(map.buildings.length >= 50, `buildings: ${map.buildings.length}`);
  assert.ok(map.buildings.some((b) => b.floors === 2), 'some two-floor houses');
  assert.ok(map.buildings.some((b) => b.kind === 'warehouse'), 'some warehouses');
  const chests = map.world.loot.chests;
  assert.ok(chests.length >= 100 * MATCH.chestsPerPlayer * 0.9, `chests: ${chests.length}`);
  assert.ok(chests.filter((c) => c.vault).length >= 3, 'vaults');
  assert.ok(map.world.loot.items.size > 100, `floor loot: ${map.world.loot.items.size}`);
  assert.ok(map.trees.length > 1500, `trees: ${map.trees.length}`);
  assert.ok(map.rocks.length > 200, `rocks: ${map.rocks.length}`);
  assert.ok(map.roads.length === map.places.length - 1);
});

test('buildings never overlap each other', () => {
  const bs = map.buildings;
  for (let i = 0; i < bs.length; i++) {
    for (let j = i + 1; j < bs.length; j++) {
      const a = bs[i];
      const b = bs[j];
      const overlap = a.originX < b.originX + b.w && a.originX + a.w > b.originX && a.originZ < b.originZ + b.d && a.originZ + a.d > b.originZ;
      assert.ok(!overlap, `buildings ${a.id} and ${b.id} overlap`);
    }
  }
});

test('ground under buildings is flat and just below the floor', () => {
  for (const b of map.buildings) {
    for (const [fx, fz] of [[0.1, 0.1], [0.9, 0.1], [0.5, 0.5], [0.1, 0.9], [0.9, 0.9]]) {
      const h = map.terrain.heightAt(b.originX + fx * b.w, b.originZ + fz * b.d);
      assert.ok(Math.abs(h - (b.baseY - 0.05)) < 1e-3, `building ${b.id} ground ${h} vs floor ${b.baseY}`);
    }
  }
});

test('two-floor houses have stairs that climb all the way to the upper floor', () => {
  const b = map.buildings.find((x) => x.floors === 2);
  const steps = b.pieces.filter((p) => p.type === 'step');
  assert.equal(steps.length, 10);
  const top = Math.max(...steps.map((p) => p.box.maxY));
  assert.ok(Math.abs(top - (b.baseY + 4)) < 1e-9);
});

test('chests sit on the ground or a floor, never underground', () => {
  for (const c of map.world.loot.chests) {
    assert.ok(c.y >= map.terrain.heightAt(c.x, c.z) - 0.1, `chest ${c.id} is underground`);
  }
});

test('the same seed builds the same map', () => {
  const again = generateMap({ seed: 1234, size: 1200, players: 100 });
  assert.equal(again.buildings.length, map.buildings.length);
  assert.equal(again.world.loot.chests.length, map.world.loot.chests.length);
  assert.deepEqual(
    { x: again.world.loot.chests[7].x, z: again.world.loot.chests[7].z },
    { x: map.world.loot.chests[7].x, z: map.world.loot.chests[7].z },
  );
});

test('spawn points are on land and spread out', () => {
  const points = pickSpawnPoints(map, 100, createRng(4));
  assert.equal(points.length, 100);
  for (const p of points) assert.ok(map.terrain.heightAt(p.x, p.z) > 0.9);
  let close = 0;
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      if (Math.hypot(points[i].x - points[j].x, points[i].z - points[j].z) < 20) close++;
    }
  }
  assert.equal(close, 0);
});

test('smaller matches get a smaller map', () => {
  const small = generateMap({ seed: 9, size: MATCH.mapSize[25], players: 25 });
  assert.ok(small.places.length >= 4);
  assert.ok(small.world.loot.chests.length >= 25 * MATCH.chestsPerPlayer * 0.9);
});

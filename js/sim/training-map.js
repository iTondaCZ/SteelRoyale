// Step 1 test map: hilly terrain, a small village, a firing range with dummies, trees and rocks.
// (Step 3 replaces this with the full procedural map.)
import { createTerrain } from './terrain.js';
import { createWorld } from './world.js';
import { createNoise2D, fbm } from './noise.js';
import { createRng, randRange } from './rng.js';
import { buildingPieces, pieceBoxes } from './buildings.js';
import { BUILD } from '../config.js';

export function createTrainingMap(seed = 7) {
  const size = 400;
  const n1 = createNoise2D(seed);
  const n2 = createNoise2D(seed + 101);
  const heightFn = (x, z) => {
    let h = fbm(n1, x * 0.007, z * 0.007, 4) * 12 + fbm(n2, x * 0.03, z * 0.03, 2) * 1.5;
    const edge = Math.max(Math.abs(x), Math.abs(z));
    if (edge > 140) {
      const k = (edge - 140) / 60;
      h += k * k * 30; // hills around the border hide the map edge
    }
    return h;
  };
  const terrain = createTerrain({ size, cellSize: 2, heightFn });
  const world = createWorld(terrain);
  const rng = createRng(seed * 7919);

  // --- Firing range (flat strip east of the village) ---
  const range = { x: 70, z: 0, w: 90, d: 30 };
  const rangeY = terrain.heightAt(range.x, range.z);
  terrain.flatten(range.x, range.z, range.w, range.d, rangeY, 10);

  // --- Village: centre (x, z), size in 4 m cells, door side ---
  const G = BUILD.grid;
  const layout = [
    { x: -30, z: -24, cx: 3, cz: 2, door: 2 },
    { x: -2, z: -36, cx: 2, cz: 2, door: 2 },
    { x: -36, z: 10, cx: 4, cz: 3, door: 1 },
    { x: 4, z: 10, cx: 2, cz: 3, door: 3 },
    { x: 16, z: -18, cx: 3, cz: 3, door: 3 },
  ];
  const plots = layout.map((b) => {
    const w = b.cx * G;
    const d = b.cz * G;
    let sum = 0;
    for (const [dx, dz] of [[0, 0], [-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) {
      sum += terrain.heightAt(b.x + dx * w, b.z + dz * d);
    }
    return { ...b, w, d, baseY: sum / 5 };
  });
  for (const p of plots) terrain.flatten(p.x, p.z, p.w + 2, p.d + 2, p.baseY - 0.05, 8);
  // Re-apply each footprint so overlapping blends can't push ground through a floor.
  for (const p of plots) terrain.flatten(p.x, p.z, p.w + 2, p.d + 2, p.baseY - 0.05, 0);

  const buildings = plots.map((p, id) => {
    const pieces = buildingPieces({
      originX: p.x - p.w / 2,
      originZ: p.z - p.d / 2,
      baseY: p.baseY,
      cellsX: p.cx,
      cellsZ: p.cz,
      doorSide: p.door,
      rng,
      buildingId: id,
    });
    for (const piece of pieces) {
      for (const b of pieceBoxes(piece)) {
        b.tag = { kind: 'piece', piece };
        piece.boxes.push(world.addBox(b));
      }
    }
    return { id, pieces, x: p.x, z: p.z, w: p.w, d: p.d, baseY: p.baseY };
  });

  // --- Cover crates on the range ---
  const crates = [];
  for (const [x, z, s] of [[47, -7, 1.4], [47, 7, 1.4], [52, 0, 1.2], [50, -14, 1.6], [53, 12, 1.3]]) {
    const y = terrain.heightAt(x, z);
    const b = world.addBox({ minX: x - s / 2, minY: y, minZ: z - s / 2, maxX: x + s / 2, maxY: y + s * 0.9, maxZ: z + s / 2 });
    b.tag = { kind: 'crate' };
    crates.push(b);
  }

  // --- Training dummies, facing the spawn (−X) ---
  const dummySpots = [
    { x: 62, z: -8, mode: 'stand', shield: 0 },
    { x: 62, z: 8, mode: 'stand', shield: 50 },
    { x: 75, z: -4, mode: 'strafe', shield: 100, phase: 0 },
    { x: 75, z: 7, mode: 'stand', shield: 150 },
    { x: 90, z: -9, mode: 'strafe', shield: 50, phase: 1.5 },
    { x: 90, z: 3, mode: 'stand', shield: 100 },
    { x: 105, z: -2, mode: 'strafe', shield: 150, phase: 3 },
    { x: 105, z: 10, mode: 'stand', shield: 0 },
  ].map((s) => ({ ...s, y: terrain.heightAt(s.x, s.z), yaw: Math.PI / 2 }));

  // --- Trees and rocks, away from the village and the range ---
  const blocked = (x, z, pad) =>
    (x > -52 - pad && x < 30 + pad && z > -46 - pad && z < 30 + pad) ||
    (x > range.x - range.w / 2 - pad && x < range.x + range.w / 2 + pad && z > -range.d / 2 - pad && z < range.d / 2 + pad);

  const trees = [];
  for (let attempt = 0; attempt < 5000 && trees.length < 220; attempt++) {
    const x = randRange(rng, -186, 186);
    const z = randRange(rng, -186, 186);
    if (blocked(x, z, 3)) continue;
    if (trees.some((t) => (t.x - x) ** 2 + (t.z - z) ** 2 < 20)) continue;
    const s = randRange(rng, 0.8, 1.35);
    const type = rng() < 0.6 ? 'pine' : 'round';
    const y = terrain.heightAt(x, z);
    const tree = { x, y, z, s, type, rot: rng() * Math.PI * 2, height: (type === 'pine' ? 7.6 : 6.5) * s };
    const r = 0.28 * s;
    const b = world.addBox({ minX: x - r, minY: y - 0.5, minZ: z - r, maxX: x + r, maxY: y + tree.height, maxZ: z + r });
    b.tag = { kind: 'tree', tree };
    trees.push(tree);
  }

  const rocks = [];
  for (let attempt = 0; attempt < 3000 && rocks.length < 60; attempt++) {
    const x = randRange(rng, -186, 186);
    const z = randRange(rng, -186, 186);
    if (blocked(x, z, 2)) continue;
    if (trees.some((t) => (t.x - x) ** 2 + (t.z - z) ** 2 < 9)) continue;
    const s = randRange(rng, 0.7, 2.2);
    const y = terrain.heightAt(x, z);
    const rock = { x, y, z, s, rot: rng() * Math.PI * 2 };
    const r = s * 0.75;
    const b = world.addBox({ minX: x - r, minY: y - 0.5, minZ: z - r, maxX: x + r, maxY: y + s * 0.85, maxZ: z + r });
    b.tag = { kind: 'rock', rock };
    rocks.push(rock);
  }

  return {
    seed,
    size,
    terrain,
    world,
    buildings,
    crates,
    trees,
    rocks,
    range: { ...range, y: rangeY },
    village: { minX: -52, maxX: 30, minZ: -46, maxZ: 30 },
    spawn: { x: 36, y: rangeY, z: 0, yaw: -Math.PI / 2 },
    dummySpots,
  };
}

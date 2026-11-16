// Procedural island: terrain, named places, buildings, roads, chests, floor loot, trees, rocks.
// Everything comes from the seed, so the same seed always rebuilds the same map.
import { createTerrain } from './terrain.js';
import { createWorld } from './world.js';
import { createNoise2D, fbm } from './noise.js';
import { createRng, randRange, randInt, pick } from './rng.js';
import { generateBuilding, pieceBoxes } from './buildings.js';
import { addChest, spawnLoot, rollFloorLoot } from './loot.js';
import { smoothstep, lerp } from './vec.js';
import { BUILD, MATCH, PLACE_NAMES } from '../config.js';

export const SURFACE = { none: 0, road: 1, dirt: 2, concrete: 3, plaza: 4 };
const CELL = 3;
const G = BUILD.grid;

function shuffle(rng, arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const segDist = (px, pz, s) => {
  const dx = s.bx - s.ax;
  const dz = s.bz - s.az;
  const l2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((px - s.ax) * dx + (pz - s.az) * dz) / l2));
  return Math.hypot(px - (s.ax + dx * t), pz - (s.az + dz * t));
};

export function generateMap({ seed = 1, size = 1200, players = 100 } = {}) {
  const rng = createRng(seed);
  const half = size / 2;
  const nBase = createNoise2D(seed + 11);
  const nDetail = createNoise2D(seed + 12);
  const nCoast = createNoise2D(seed + 13);
  const nRidge = createNoise2D(seed + 14);
  const nForest = createNoise2D(seed + 15);

  const mountain = { x: randRange(rng, -0.3, 0.3) * size, z: randRange(rng, -0.3, 0.3) * size, r: size * 0.16 };
  let lake;
  for (let i = 0; i < 50; i++) {
    lake = { x: randRange(rng, -0.3, 0.3) * size, z: randRange(rng, -0.3, 0.3) * size, r: size * 0.055 };
    if (Math.hypot(lake.x - mountain.x, lake.z - mountain.z) > size * 0.35) break;
  }

  const heightFn = (x, z) => {
    const nx = x / half;
    const nz = z / half;
    const edge = Math.pow(nx ** 4 + nz ** 4, 0.25) + fbm(nCoast, x * 0.004, z * 0.004, 3) * 0.1;
    const land = smoothstep((0.95 - edge) / 0.18);
    let h = 7 + fbm(nBase, x * 0.0032, z * 0.0032, 4) * 15 + fbm(nDetail, x * 0.02, z * 0.02, 2) * 1.2;
    const md = Math.hypot(x - mountain.x, z - mountain.z) / mountain.r;
    if (md < 1.7) h += Math.pow(1 - md / 1.7, 2) * (40 + fbm(nRidge, x * 0.012, z * 0.012, 3) * 14);
    h = Math.max(h, 1.6);
    const ld = Math.hypot(x - lake.x, z - lake.z) / lake.r;
    if (ld < 1.9) h = lerp(h, -1.2, smoothstep((1.9 - ld) / 0.9));
    return Math.max(-1.4, lerp(-1.4, h, land));
  };

  const terrain = createTerrain({ size, cellSize: CELL, heightFn });
  const world = createWorld(terrain, { waterLevel: 0 });
  const H = (x, z) => terrain.heightAt(x, z);
  const inMap = (x, z, margin) => Math.abs(x) < half - margin && Math.abs(z) < half - margin;

  // ---------- Named places ----------
  const placeTypes = ['town', 'industrial', 'town', 'farm', 'town', 'industrial', 'farm', 'town', 'outpost', 'town'];
  const placeCount = Math.max(4, Math.round(size / 130));
  const minPlaceDist = size * 0.19;
  const names = shuffle(rng, [...PLACE_NAMES]);
  const places = [];
  for (let attempt = 0; attempt < 1500 && places.length < placeCount; attempt++) {
    const x = randRange(rng, -half * 0.7, half * 0.7);
    const z = randRange(rng, -half * 0.7, half * 0.7);
    const h = H(x, z);
    if (h < 2.5) continue;
    if (Math.hypot(x - mountain.x, z - mountain.z) < mountain.r * 1.05) continue;
    if (Math.hypot(x - lake.x, z - lake.z) < lake.r * 2.2) continue;
    let lo = Infinity;
    let hi = -Infinity;
    for (const [dx, dz] of [[-30, -30], [30, -30], [-30, 30], [30, 30], [0, 0]]) {
      const v = H(x + dx, z + dz);
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
    if (hi - lo > 10 || lo < 2) continue;
    if (places.some((p) => Math.hypot(p.x - x, p.z - z) < minPlaceDist)) continue;
    const type = placeTypes[places.length % placeTypes.length];
    places.push({ id: places.length, name: names[places.length % names.length], type, x, z, radius: type === 'industrial' ? 75 : 65 });
  }

  // ---------- Building lots ----------
  const lots = [];
  const overlaps = (x0, z0, x1, z1, margin) =>
    lots.some((l) => x0 < l.x1 + margin && x1 > l.x0 - margin && z0 < l.z1 + margin && z1 > l.z0 - margin);

  function tryLot(kind, cx, cz, cellsX, cellsZ, floors, doorSides, place = null) {
    const w = cellsX * G;
    const d = cellsZ * G;
    // Half-metre origins put doorway centres mid-cell on the 1 m nav grid (see navgrid.js).
    const originX = Math.round(cx - w / 2) + 0.5;
    const originZ = Math.round(cz - d / 2) + 0.5;
    if (!inMap(originX, originZ, 40) || !inMap(originX + w, originZ + d, 40)) return null;
    let lo = Infinity;
    let hi = -Infinity;
    let sum = 0;
    for (const [fx, fz] of [[0, 0], [1, 0], [0, 1], [1, 1], [0.5, 0.5]]) {
      const v = H(originX + fx * w, originZ + fz * d);
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
      sum += v;
    }
    if (lo < 1.4 || hi - lo > 5) return null;
    // Each lot flattens its footprint plus one 3 m terrain cell around it, so lots
    // must stay > 6 m apart or one building's ground would shift its neighbour's.
    if (overlaps(originX, originZ, originX + w, originZ + d, 7)) return null;
    const lot = {
      kind, originX, originZ, cellsX, cellsZ, floors, doorSides, place,
      x0: originX, z0: originZ, x1: originX + w, z1: originZ + d, baseY: sum / 5 + 0.1,
    };
    lots.push(lot);
    return lot;
  }

  const doorToward = (dx, dz) => (Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 3 : 1) : dz > 0 ? 0 : 2);
  const containers = [];

  for (const place of places) {
    if (place.type === 'town') {
      const spots = [];
      for (let gx = -2; gx <= 2; gx++) for (let gz = -2; gz <= 2; gz++) if (gx || gz) spots.push([gx, gz]);
      shuffle(rng, spots);
      const want = randInt(rng, 8, 14);
      let made = 0;
      for (const [gx, gz] of spots) {
        if (made >= want) break;
        const cx = place.x + gx * 23 + randRange(rng, -1.5, 1.5);
        const cz = place.z + gz * 23 + randRange(rng, -1.5, 1.5);
        const floors = rng() < 0.45 ? 2 : 1;
        const lot = tryLot('house', cx, cz, randInt(rng, 2, 3), randInt(rng, 2, 3), floors, [doorToward(gx, gz)], place);
        if (lot) made++;
      }
    } else if (place.type === 'industrial') {
      const spots = [];
      for (let gx = -1; gx <= 1; gx++) for (let gz = -1; gz <= 1; gz++) if (gx || gz) spots.push([gx, gz]);
      shuffle(rng, spots);
      let made = 0;
      for (const [gx, gz] of spots) {
        if (made >= 4) break;
        const cellsX = randInt(rng, 4, 5);
        const cellsZ = randInt(rng, 3, 4);
        const sides = Math.abs(gx) >= Math.abs(gz) ? [1, 3] : [0, 2];
        if (tryLot('warehouse', place.x + gx * 36, place.z + gz * 34, cellsX, cellsZ, 1, sides, place)) made++;
      }
      place.containerCount = randInt(rng, 10, 16);
    } else if (place.type === 'farm') {
      tryLot('barn', place.x, place.z, 3, 4, 1, [1, 3], place);
      for (let i = 0; i < 6; i++) {
        const a = rng() * Math.PI * 2;
        const r = randRange(rng, 24, 40);
        const kind = i < 2 ? 'house' : 'shed';
        const cells = kind === 'house' ? [2, randInt(rng, 2, 3)] : [1, randInt(rng, 1, 2)];
        tryLot(kind, place.x + Math.cos(a) * r, place.z + Math.sin(a) * r, cells[0], cells[1], kind === 'house' && rng() < 0.5 ? 2 : 1, [doorToward(Math.cos(a), Math.sin(a))], place);
      }
    } else {
      tryLot('house', place.x, place.z, 3, 3, 2, [2], place);
      for (let i = 0; i < 4; i++) {
        const a = rng() * Math.PI * 2;
        tryLot('shed', place.x + Math.cos(a) * 20, place.z + Math.sin(a) * 20, 1, 2, 1, [doorToward(Math.cos(a), Math.sin(a))], place);
      }
      place.containerCount = 4;
    }
  }

  // Scattered houses and sheds in the countryside
  const scattered = Math.round(24 * (size / 1200) ** 2);
  for (let attempt = 0, made = 0; attempt < 800 && made < scattered; attempt++) {
    const x = randRange(rng, -half * 0.85, half * 0.85);
    const z = randRange(rng, -half * 0.85, half * 0.85);
    if (places.some((p) => Math.hypot(p.x - x, p.z - z) < p.radius + 40)) continue;
    const shed = rng() < 0.4;
    const lot = shed
      ? tryLot('shed', x, z, 1, randInt(rng, 1, 2), 1, [randInt(rng, 0, 3)])
      : tryLot('house', x, z, 2, randInt(rng, 2, 3), rng() < 0.35 ? 2 : 1, [randInt(rng, 0, 3)]);
    if (lot) made++;
  }

  // Flatten ground under every lot, then re-apply footprints so overlapping blends can't poke through floors.
  for (const l of lots) terrain.flatten((l.x0 + l.x1) / 2, (l.z0 + l.z1) / 2, l.x1 - l.x0, l.z1 - l.z0, l.baseY - 0.05, 7);
  for (const l of lots) terrain.flatten((l.x0 + l.x1) / 2, (l.z0 + l.z1) / 2, l.x1 - l.x0, l.z1 - l.z0, l.baseY - 0.05, 0);

  // ---------- Buildings ----------
  const buildings = lots.map((l, id) => {
    const b = generateBuilding({
      kind: l.kind, originX: l.originX, originZ: l.originZ, baseY: l.baseY, cellsX: l.cellsX, cellsZ: l.cellsZ,
      floors: l.floors, doorSides: l.doorSides, rng, id,
    });
    b.place = l.place ? l.place.id : null;
    for (const piece of b.pieces) {
      for (const bx of pieceBoxes(piece)) {
        bx.tag = { kind: 'piece', piece };
        piece.boxes.push(world.addBox(bx));
      }
    }
    // Warehouses get crate stacks for cover.
    b.crates = [];
    if (l.kind === 'warehouse' || l.kind === 'barn') {
      for (let i = 0; i < 4; i++) {
        const cx = l.originX + randRange(rng, 2.5, l.cellsX * G - 2.5);
        const cz = l.originZ + randRange(rng, 2.5, l.cellsZ * G - 2.5);
        const s = randRange(rng, 1.1, 1.5);
        const stack = rng() < 0.4 ? 2 : 1;
        for (let k = 0; k < stack; k++) {
          const crate = world.addBox({ minX: cx - s / 2, minY: l.baseY + k * s * 0.9, minZ: cz - s / 2, maxX: cx + s / 2, maxY: l.baseY + (k + 1) * s * 0.9, maxZ: cz + s / 2 });
          crate.tag = { kind: 'crate' };
          b.crates.push(crate);
        }
      }
    }
    return b;
  });

  // ---------- Containers (industrial yards, outposts) ----------
  for (const place of places) {
    for (let i = 0, made = 0; i < 80 && made < (place.containerCount || 0); i++) {
      const a = rng() * Math.PI * 2;
      const r = randRange(rng, 10, place.radius);
      const x = Math.round(place.x + Math.cos(a) * r);
      const z = Math.round(place.z + Math.sin(a) * r);
      const alongX = rng() < 0.5;
      const w = alongX ? 6 : 2.4;
      const d = alongX ? 2.4 : 6;
      if (overlaps(x - w / 2, z - d / 2, x + w / 2, z + d / 2, 2.5)) continue;
      if (containers.some((c) => x - w / 2 < c.maxX + 2 && x + w / 2 > c.minX - 2 && z - d / 2 < c.maxZ + 2 && z + d / 2 > c.minZ - 2 && c.level === 0)) continue;
      const y = H(x, z);
      if (y < 1.4) continue;
      const levels = rng() < 0.35 ? 2 : 1;
      for (let k = 0; k < levels; k++) {
        const c = world.addBox({ minX: x - w / 2, minY: y - 0.3 + k * 2.4, minZ: z - d / 2, maxX: x + w / 2, maxY: y + 2.1 + k * 2.4, maxZ: z + d / 2 });
        c.tag = { kind: 'container' };
        c.level = k;
        c.color = randInt(rng, 0, 4);
        containers.push(c);
      }
      made++;
    }
  }

  // ---------- Roads: minimum spanning tree between places ----------
  const roads = [];
  if (places.length > 1) {
    const inTree = new Set([0]);
    while (inTree.size < places.length) {
      let best = null;
      for (const i of inTree) {
        for (let j = 0; j < places.length; j++) {
          if (inTree.has(j)) continue;
          const d = Math.hypot(places[i].x - places[j].x, places[i].z - places[j].z);
          if (!best || d < best.d) best = { i, j, d };
        }
      }
      inTree.add(best.j);
      roads.push({ ax: places[best.i].x, az: places[best.i].z, bx: places[best.j].x, bz: places[best.j].z });
    }
  }
  const nearRoad = (x, z, r) => roads.some((s) => segDist(x, z, s) < r);
  const inLot = (x, z, margin) => lots.some((l) => x > l.x0 - margin && x < l.x1 + margin && z > l.z0 - margin && z < l.z1 + margin);
  const nearContainer = (x, z, margin) => containers.some((c) => x > c.minX - margin && x < c.maxX + margin && z > c.minZ - margin && z < c.maxZ + margin);

  // ---------- Ground paint (per terrain vertex) ----------
  const cols = terrain.cols;
  const surface = new Uint8Array(cols * cols);
  const paint = (x0, z0, x1, z1, code, test = null) => {
    const i0 = Math.max(0, Math.floor((x0 + half) / CELL));
    const i1 = Math.min(cols - 1, Math.ceil((x1 + half) / CELL));
    const j0 = Math.max(0, Math.floor((z0 + half) / CELL));
    const j1 = Math.min(cols - 1, Math.ceil((z1 + half) / CELL));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const x = -half + i * CELL;
        const z = -half + j * CELL;
        if (!test || test(x, z)) surface[j * cols + i] = code;
      }
    }
  };
  for (const p of places) {
    if (p.type === 'industrial') paint(p.x - 70, p.z - 70, p.x + 70, p.z + 70, SURFACE.concrete, (x, z) => Math.hypot(x - p.x, z - p.z) < 62);
    if (p.type === 'town') paint(p.x - 14, p.z - 14, p.x + 14, p.z + 14, SURFACE.plaza, (x, z) => Math.hypot(x - p.x, z - p.z) < 12);
  }
  for (const s of roads) {
    paint(Math.min(s.ax, s.bx) - 4, Math.min(s.az, s.bz) - 4, Math.max(s.ax, s.bx) + 4, Math.max(s.az, s.bz) + 4, SURFACE.road, (x, z) => segDist(x, z, s) < 3.2);
  }
  for (const l of lots) paint(l.x0 - 3, l.z0 - 3, l.x1 + 3, l.z1 + 3, SURFACE.dirt);

  // ---------- Chests ----------
  const targetChests = players * MATCH.chestsPerPlayer;
  const chestFree = (x, z) => world.grid.query(x - 0.8, z - 0.8, x + 0.8, z + 0.8).every((b) => b.maxY < H(x, z) + 0.2 || b.tag?.kind === 'piece' && (b.tag.piece.type === 'floor' || b.tag.piece.type === 'roof'));
  // Vaults at the centres of the first few places
  const vaultCount = Math.min(places.length, size > 900 ? 5 : 3);
  for (let i = 0; i < vaultCount; i++) {
    const p = places[i];
    for (let k = 0; k < 20; k++) {
      const x = p.x + randRange(rng, -6, 6);
      const z = p.z + randRange(rng, -6, 6);
      if (inLot(x, z, 1.5) || nearContainer(x, z, 1.5)) continue;
      addChest(world, { x, y: H(x, z), z, yaw: randInt(rng, 0, 3) * (Math.PI / 2), vault: true });
      break;
    }
  }
  const spots = [];
  for (const b of buildings) {
    const picks = shuffle(rng, [...b.chestSpots]).slice(0, Math.max(1, Math.round((b.cellsX * b.cellsZ * b.floors) / 3)));
    for (const s of picks) spots.push({ ...s, building: b.id });
  }
  shuffle(rng, spots);
  const placedChests = [];
  for (const s of spots) {
    if (world.loot.chests.length >= targetChests * 0.8) break;
    if (placedChests.some((c) => Math.hypot(c.x - s.x, c.z - s.z) < 3.5)) continue;
    placedChests.push(addChest(world, { x: s.x, y: s.y, z: s.z, yaw: s.yaw }));
  }
  for (let attempt = 0; attempt < 4000 && world.loot.chests.length < targetChests; attempt++) {
    const p = places.length && rng() < 0.6 ? pick(rng, places) : null;
    const x = p ? p.x + randRange(rng, -p.radius * 1.4, p.radius * 1.4) : randRange(rng, -half * 0.85, half * 0.85);
    const z = p ? p.z + randRange(rng, -p.radius * 1.4, p.radius * 1.4) : randRange(rng, -half * 0.85, half * 0.85);
    const y = H(x, z);
    if (y < 1.5 || inLot(x, z, 2) || nearContainer(x, z, 1.5) || !chestFree(x, z)) continue;
    addChest(world, { x, y, z, yaw: randInt(rng, 0, 3) * (Math.PI / 2) });
  }

  // ---------- Floor loot in buildings ----------
  for (const b of buildings) {
    for (const s of b.lootSpots) {
      if (rng() > 0.5) continue;
      const items = rollFloorLoot(rng);
      items.forEach((item, k) => {
        const loot = spawnLoot(world, item, { x: s.x + k * 0.5, y: s.y, z: s.z + k * 0.3 });
        loot.settled = true;
      });
    }
  }

  // ---------- Trees ----------
  const trees = [];
  const treeCells = new Map();
  const spacing = 7;
  for (let gx = -half + 4; gx < half - 4; gx += spacing) {
    for (let gz = -half + 4; gz < half - 4; gz += spacing) {
      const x = gx + randRange(rng, -2.5, 2.5);
      const z = gz + randRange(rng, -2.5, 2.5);
      const forest = fbm(nForest, x * 0.006, z * 0.006, 3);
      const p = smoothstep((forest + 0.05) / 0.45) * 0.75 + 0.04;
      if (rng() > p) continue;
      const y = H(x, z);
      if (y < 2 || y > 42) continue;
      if (inLot(x, z, 4) || nearRoad(x, z, 5) || nearContainer(x, z, 3)) continue;
      if (places.some((pl) => Math.hypot(pl.x - x, pl.z - z) < (pl.type === 'town' ? 16 : 26))) continue;
      const s = randRange(rng, 0.8, 1.35);
      const type = y > 20 || rng() < 0.55 ? 'pine' : 'round';
      const tree = { x, y, z, s, type, rot: rng() * Math.PI * 2, height: (type === 'pine' ? 7.6 : 6.5) * s };
      const r = 0.28 * s;
      const b = world.addBox({ minX: x - r, minY: y - 0.5, minZ: z - r, maxX: x + r, maxY: y + tree.height, maxZ: z + r });
      b.tag = { kind: 'tree', tree };
      trees.push(tree);
      const k = `${Math.floor(x / 150)},${Math.floor(z / 150)}`;
      if (!treeCells.has(k)) treeCells.set(k, []);
      treeCells.get(k).push(tree);
    }
  }

  // ---------- Rocks ----------
  const rocks = [];
  const rockTarget = Math.round((size * size) / 2600);
  for (let attempt = 0; attempt < rockTarget * 6 && rocks.length < rockTarget; attempt++) {
    const onMountain = rng() < 0.35;
    const x = onMountain ? mountain.x + randRange(rng, -mountain.r * 1.3, mountain.r * 1.3) : randRange(rng, -half * 0.9, half * 0.9);
    const z = onMountain ? mountain.z + randRange(rng, -mountain.r * 1.3, mountain.r * 1.3) : randRange(rng, -half * 0.9, half * 0.9);
    const y = H(x, z);
    if (y < 0.5 || inLot(x, z, 3) || nearRoad(x, z, 4) || nearContainer(x, z, 3)) continue;
    const s = onMountain ? randRange(rng, 1.2, 3.2) : randRange(rng, 0.6, 2.2);
    const rock = { x, y, z, s, rot: rng() * Math.PI * 2 };
    const r = s * 0.75;
    const b = world.addBox({ minX: x - r, minY: y - 0.5, minZ: z - r, maxX: x + r, maxY: y + s * 0.85, maxZ: z + r });
    b.tag = { kind: 'rock', rock };
    rocks.push(rock);
  }

  return {
    mode: 'match',
    seed,
    size,
    half,
    terrain,
    world,
    waterLevel: 0,
    surface,
    places,
    buildings,
    containers,
    crates: buildings.flatMap((b) => b.crates),
    roads,
    trees,
    rocks,
    mountain,
    lake,
  };
}

/** Random spawn points on land, spread out, mostly near named places. */
export function pickSpawnPoints(map, count, rng) {
  const { terrain, places, world, half } = map;
  const points = [];
  const blocked = (x, z) => world.grid.query(x - 0.6, z - 0.6, x + 0.6, z + 0.6).some((b) => b.maxY > terrain.heightAt(x, z) + 0.4);
  let spacing = MATCH.minSpawnSpacing;
  for (let attempt = 0; points.length < count; attempt++) {
    if (attempt > 0 && attempt % 4000 === 0) spacing *= 0.8; // crowded map: relax spacing
    const p = places.length && rng() < 0.3 ? places[Math.floor(rng() * places.length)] : null;
    const x = p ? p.x + randRange(rng, -p.radius * 1.8, p.radius * 1.8) : randRange(rng, -half * 0.85, half * 0.85);
    const z = p ? p.z + randRange(rng, -p.radius * 1.8, p.radius * 1.8) : randRange(rng, -half * 0.85, half * 0.85);
    const y = terrain.heightAt(x, z);
    if (y < 1 || Math.abs(x) > half - 20 || Math.abs(z) > half - 20) continue;
    if (blocked(x, z)) continue;
    if (points.some((q) => (q.x - x) ** 2 + (q.z - z) ** 2 < spacing * spacing)) continue;
    points.push({ x, y, z, yaw: rng() * Math.PI * 2 });
  }
  return points;
}

// Buildings are made of grid pieces on a 4 m grid (floor, roof, wall, doorway, window, step).
// Player-built pieces will use the same system later, so everything can be destroyed alike.
import { BUILD } from '../config.js';

const box = (minX, minY, minZ, maxX, maxY, maxZ) => ({ minX, minY, minZ, maxX, maxY, maxZ });

// Sides: 0 = north (−Z), 1 = east (+X), 2 = south (+Z), 3 = west (−X).
// Chest yaw = the yaw of someone standing in front of it, looking at it.
const CHEST_YAW = [0, -Math.PI / 2, Math.PI, Math.PI / 2];

/**
 * Generate a building.
 * kind: 'house' | 'warehouse' | 'barn' | 'shed'
 * (originX, originZ) is the minimum corner; baseY is the ground-floor top.
 */
export function generateBuilding({
  kind = 'house', originX, originZ, baseY, cellsX, cellsZ, floors = 1, doorSides = [2], rng = Math.random, id = 0,
  windowChance = kind === 'warehouse' ? 0.15 : 0.35,
}) {
  const G = BUILD.grid;
  const H = BUILD.storey;
  const pieces = [];
  const lootSpots = [];
  const chestSpots = [];
  const add = (type, x, y, z, axis = null, extra = {}) =>
    pieces.push({ type, x, y, z, axis, buildingId: id, hp: BUILD.pieceHp, maxHp: BUILD.pieceHp, boxes: [], ...extra });

  const doorIndex = [Math.floor(cellsX / 2), Math.floor(cellsZ / 2), Math.floor(cellsX / 2), Math.floor(cellsZ / 2)];
  const isDoorCell = (i, j) =>
    (doorSides.includes(0) && j === 0 && i === doorIndex[0]) ||
    (doorSides.includes(2) && j === cellsZ - 1 && i === doorIndex[2]) ||
    (doorSides.includes(3) && i === 0 && j === doorIndex[3]) ||
    (doorSides.includes(1) && i === cellsX - 1 && j === doorIndex[1]);

  // Stairwell: a corner cell that isn't in front of a door.
  let stair = null;
  if (floors > 1) {
    const corners = [[0, 0], [cellsX - 1, 0], [0, cellsZ - 1], [cellsX - 1, cellsZ - 1]].filter(([i, j]) => !isDoorCell(i, j));
    const [i, j] = corners[Math.floor(rng() * corners.length)];
    stair = { i, j, rise: i === 0 ? 1 : -1, wallSide: j === 0 ? 0 : 2 };
  }
  const isStair = (i, j) => stair && stair.i === i && stair.j === j;

  for (let f = 0; f < floors; f++) {
    const y = baseY + f * H;
    for (let i = 0; i < cellsX; i++) {
      for (let j = 0; j < cellsZ; j++) {
        if (f > 0 && isStair(i, j)) continue; // stairwell hole
        add('floor', originX + (i + 0.5) * G, y, originZ + (j + 0.5) * G, null, { floor: f });
      }
    }

    // Exterior walls
    const wall = (door) => (door ? 'doorway' : rng() < windowChance ? 'window' : 'wall');
    for (let i = 0; i < cellsX; i++) {
      const x = originX + (i + 0.5) * G;
      add(wall(f === 0 && doorSides.includes(0) && i === doorIndex[0]), x, y, originZ, 'x', { floor: f });
      add(wall(f === 0 && doorSides.includes(2) && i === doorIndex[2]), x, y, originZ + cellsZ * G, 'x', { floor: f });
    }
    for (let j = 0; j < cellsZ; j++) {
      const z = originZ + (j + 0.5) * G;
      add(wall(f === 0 && doorSides.includes(3) && j === doorIndex[3]), originX, y, z, 'z', { floor: f });
      add(wall(f === 0 && doorSides.includes(1) && j === doorIndex[1]), originX + cellsX * G, y, z, 'z', { floor: f });
    }

    // One interior wall with a doorway on the ground floor of bigger houses.
    if (f === 0 && kind === 'house' && cellsX >= 3) {
      const split = Math.floor(cellsX / 2);
      for (let j = 0; j < cellsZ; j++) {
        add(j === Math.floor(cellsZ / 2) ? 'doorway' : 'wall', originX + split * G, y, originZ + (j + 0.5) * G, 'z', { floor: f, interior: true });
      }
    }

    // Loot and chest spots
    for (let i = 0; i < cellsX; i++) {
      for (let j = 0; j < cellsZ; j++) {
        if (isStair(i, j)) continue;
        const cx = originX + (i + 0.5) * G;
        const cz = originZ + (j + 0.5) * G;
        lootSpots.push({ x: cx + (rng() - 0.5) * 1.6, y, z: cz + (rng() - 0.5) * 1.6, floor: f });
        if (isDoorCell(i, j) && f === 0) continue;
        const sides = [];
        if (j === 0) sides.push(0);
        if (j === cellsZ - 1) sides.push(2);
        if (i === 0) sides.push(3);
        if (i === cellsX - 1) sides.push(1);
        for (const s of sides) {
          const off = G / 2 - 0.55;
          const dx = s === 1 ? off : s === 3 ? -off : 0;
          const dz = s === 2 ? off : s === 0 ? -off : 0;
          chestSpots.push({ x: cx + dx, y, z: cz + dz, yaw: CHEST_YAW[s], floor: f });
        }
      }
    }
  }

  // Stairs: 10 steps of 0.4 m along the outer wall of the stairwell cell, rising into the building.
  if (stair) {
    const x0 = originX + stair.i * G;
    const zIn = stair.wallSide === 0 ? originZ + stair.j * G + 0.15 : originZ + (stair.j + 1) * G - 1.35;
    for (let f = 0; f < floors - 1; f++) {
      const y = baseY + f * H;
      const steps = H / 0.4;
      for (let k = 0; k < steps; k++) {
        const a = stair.rise > 0 ? x0 + k * 0.4 : x0 + G - (k + 1) * 0.4;
        add('step', a + 0.2, y, zIn + 0.6, null, {
          floor: f,
          box: box(a, y, zIn, a + 0.4, y + (k + 1) * 0.4, zIn + 1.2),
        });
      }
    }
  }

  // Roof
  for (let i = 0; i < cellsX; i++) {
    for (let j = 0; j < cellsZ; j++) {
      add('roof', originX + (i + 0.5) * G, baseY + floors * H, originZ + (j + 0.5) * G);
    }
  }

  return {
    id,
    kind,
    originX,
    originZ,
    baseY,
    cellsX,
    cellsZ,
    floors,
    x: originX + (cellsX * G) / 2,
    z: originZ + (cellsZ * G) / 2,
    w: cellsX * G,
    d: cellsZ * G,
    pieces,
    lootSpots,
    chestSpots,
    stair,
  };
}

/** Step 1 helper kept for the training range: one-floor house. */
export function buildingPieces({ originX, originZ, baseY, cellsX, cellsZ, doorSide = 2, rng = Math.random, buildingId = 0 }) {
  return generateBuilding({ kind: 'house', originX, originZ, baseY, cellsX, cellsZ, floors: 1, doorSides: [doorSide], rng, id: buildingId }).pieces;
}

/** Collision boxes for one piece. Walls along X are extended by half a thickness to close corners. */
export function pieceBoxes(p) {
  const G = BUILD.grid;
  const T = BUILD.wallThickness;
  const F = BUILD.floorThickness;
  const H = BUILD.storey - F; // walls stop under the slab above
  const h = G / 2;
  const ext = p.axis === 'x' ? T / 2 : 0;

  const seg = (a0, a1, y0, y1) =>
    p.axis === 'x'
      ? box(p.x + a0, p.y + y0, p.z - T / 2, p.x + a1, p.y + y1, p.z + T / 2)
      : box(p.x - T / 2, p.y + y0, p.z + a0, p.x + T / 2, p.y + y1, p.z + a1);

  switch (p.type) {
    case 'floor':
    case 'roof':
      return [box(p.x - h, p.y - F, p.z - h, p.x + h, p.y, p.z + h)];
    case 'step':
      return [{ ...p.box }];
    case 'wall':
      return [seg(-h - ext, h + ext, 0, H)];
    case 'doorway': {
      const dw = BUILD.doorWidth / 2;
      return [seg(-h - ext, -dw, 0, H), seg(dw, h + ext, 0, H), seg(-dw, dw, BUILD.doorHeight, H)];
    }
    case 'window': {
      const ww = BUILD.windowWidth / 2;
      return [
        seg(-h - ext, -ww, 0, H),
        seg(ww, h + ext, 0, H),
        seg(-ww, ww, 0, BUILD.windowBottom),
        seg(-ww, ww, BUILD.windowTop, H),
      ];
    }
    default:
      throw new Error(`Unknown piece type: ${p.type}`);
  }
}

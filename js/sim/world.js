// The world: terrain + static boxes (in a spatial grid) + characters, with raycasts.
import { createGrid } from './spatial-grid.js';
import { rayBox, raySphere, rayCapsule } from './collision.js';
import { HITBOX } from '../config.js';
import { createLootSystem } from './loot.js';

export function createWorld(terrain, { waterLevel } = {}) {
  const grid = createGrid(8);
  const world = {
    terrain,
    grid,
    waterLevel,
    boxes: new Set(),
    characters: new Map(),
    loot: createLootSystem(),
    projectiles: [],
    addBox(box) {
      world.boxes.add(box);
      grid.insert(box);
      return box;
    },
    removeBox(box) {
      if (world.boxes.delete(box)) grid.remove(box);
    },
    /**
     * Nearest hit along a normalised ray, or null.
     * Returns { t, point, kind: 'terrain'|'box'|'character', box?, characterId?, zone?: 'head'|'body' }.
     */
    raycast(o, d, maxDist, opts) {
      return raycast(world, o, d, maxDist, opts);
    },
  };
  return world;
}

/** March the ray over the heightfield, then refine with bisection. */
export function terrainRaycast(terrain, o, d, maxDist) {
  const step = terrain.cellSize * 0.5;
  if (o.y - terrain.heightAt(o.x, o.z) < 0) return 0;
  let prevT = 0;
  for (let t = step; ; t += step) {
    if (t > maxDist) t = maxDist;
    const y = o.y + d.y * t;
    if (d.y >= 0 && y > terrain.maxHeight) return null;
    const diff = y - terrain.heightAt(o.x + d.x * t, o.z + d.z * t);
    if (diff <= 0) {
      let lo = prevT;
      let hi = t;
      for (let i = 0; i < 12; i++) {
        const mid = (lo + hi) / 2;
        const md = o.y + d.y * mid - terrain.heightAt(o.x + d.x * mid, o.z + d.z * mid);
        if (md > 0) lo = mid;
        else hi = mid;
      }
      return hi;
    }
    if (t >= maxDist) return null;
    prevT = t;
  }
}

const _a = { x: 0, y: 0, z: 0 };
const _b = { x: 0, y: 0, z: 0 };
const _h = { x: 0, y: 0, z: 0 };

function raycast(world, o, d, maxDist, opts = {}) {
  const { ignoreId = -1, ignoreCharacters = false, ignoreTerrain = false, ignoreBoxes = false } = opts;
  let best = null;
  let bestT = maxDist;

  if (!ignoreTerrain) {
    const t = terrainRaycast(world.terrain, o, d, maxDist);
    if (t !== null && t <= bestT) {
      bestT = t;
      best = { kind: 'terrain' };
    }
  }

  if (!ignoreBoxes) {
    world.grid.alongRay(o.x, o.z, d.x, d.z, bestT, (box) => {
      const t = rayBox(o, d, box, bestT);
      if (t !== null && t < bestT) {
        bestT = t;
        best = { kind: 'box', box };
      }
      return bestT;
    });
  }

  if (!ignoreCharacters) {
    for (const c of world.characters.values()) {
      const body = c.crouching ? HITBOX.crouchBody : HITBOX.body;
      const head = c.crouching ? HITBOX.crouchHead : HITBOX.head;
      if (!c.alive || c.id === ignoreId) continue;
      // Broad phase: skip characters far from the ray.
      const wx = c.pos.x - o.x;
      const wy = c.pos.y + 0.9 - o.y;
      const wz = c.pos.z - o.z;
      const proj = wx * d.x + wy * d.y + wz * d.z;
      if (proj < -1.5 || proj > bestT + 1.5) continue;
      const px = wx - d.x * proj;
      const py = wy - d.y * proj;
      const pz = wz - d.z * proj;
      if (px * px + py * py + pz * pz > 1.6) continue;

      _h.x = c.pos.x; _h.y = c.pos.y + head.y; _h.z = c.pos.z;
      _a.x = c.pos.x; _a.y = c.pos.y + body.bottom; _a.z = c.pos.z;
      _b.x = c.pos.x; _b.y = c.pos.y + body.top; _b.z = c.pos.z;
      const th = raySphere(o, d, _h, head.radius);
      const tb = rayCapsule(o, d, _a, _b, body.radius);
      let t = null;
      let zone = null;
      if (th !== null && (tb === null || th <= tb)) {
        t = th;
        zone = 'head';
      } else if (tb !== null) {
        t = tb;
        zone = 'body';
      }
      if (t !== null && t < bestT) {
        bestT = t;
        best = { kind: 'character', characterId: c.id, zone };
      }
    }
  }

  if (!best) return null;
  best.t = bestT;
  best.point = { x: o.x + d.x * bestT, y: o.y + d.y * bestT, z: o.z + d.z * bestT };
  return best;
}

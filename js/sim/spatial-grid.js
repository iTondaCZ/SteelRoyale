// Uniform XZ grid of axis-aligned boxes for fast collision and ray queries.
// box = { minX, minY, minZ, maxX, maxY, maxZ, tag? }

export function createGrid(cellSize = 8) {
  const cells = new Map();
  let stamp = 0;
  const key = (cx, cz) => (cx + 32768) * 65536 + (cz + 32768);
  const cellOf = (v) => Math.floor(v / cellSize);

  function forCells(box, fn) {
    const x0 = cellOf(box.minX);
    const x1 = cellOf(box.maxX);
    const z0 = cellOf(box.minZ);
    const z1 = cellOf(box.maxZ);
    for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) fn(key(cx, cz));
  }

  function insert(box) {
    box._stamp = 0;
    forCells(box, (k) => {
      let list = cells.get(k);
      if (!list) cells.set(k, (list = []));
      list.push(box);
    });
  }

  function remove(box) {
    forCells(box, (k) => {
      const list = cells.get(k);
      if (!list) return;
      const i = list.indexOf(box);
      if (i >= 0) list.splice(i, 1);
      if (list.length === 0) cells.delete(k);
    });
  }

  /** All boxes overlapping the XZ rectangle, each once. */
  function query(minX, minZ, maxX, maxZ, out = []) {
    stamp++;
    const x0 = cellOf(minX);
    const x1 = cellOf(maxX);
    const z0 = cellOf(minZ);
    const z1 = cellOf(maxZ);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const list = cells.get(key(cx, cz));
        if (!list) continue;
        for (const b of list) {
          if (b._stamp === stamp) continue;
          b._stamp = stamp;
          if (b.maxX < minX || b.minX > maxX || b.maxZ < minZ || b.minZ > maxZ) continue;
          out.push(b);
        }
      }
    }
    return out;
  }

  /**
   * Walk the cells a ray crosses (Amanatides–Woo). (dx, dz) are the XZ parts of a
   * normalised 3D direction, so t is the same distance as along the 3D ray.
   * cb(box) is called once per box and returns the best hit distance so far;
   * the walk stops once that best hit is closer than the next cell.
   */
  function alongRay(ox, oz, dx, dz, maxDist, cb) {
    stamp++;
    const myStamp = stamp;
    let cx = cellOf(ox);
    let cz = cellOf(oz);
    const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
    const stepZ = dz > 0 ? 1 : dz < 0 ? -1 : 0;
    const tDeltaX = stepX !== 0 ? cellSize / Math.abs(dx) : Infinity;
    const tDeltaZ = stepZ !== 0 ? cellSize / Math.abs(dz) : Infinity;
    let tMaxX = stepX > 0 ? ((cx + 1) * cellSize - ox) / dx : stepX < 0 ? (cx * cellSize - ox) / dx : Infinity;
    let tMaxZ = stepZ > 0 ? ((cz + 1) * cellSize - oz) / dz : stepZ < 0 ? (cz * cellSize - oz) / dz : Infinity;
    let best = Infinity;
    for (let guard = 0; guard < 100000; guard++) {
      const list = cells.get(key(cx, cz));
      if (list) {
        for (const b of list) {
          if (b._stamp === myStamp) continue;
          b._stamp = myStamp;
          const r = cb(b);
          if (typeof r === 'number' && r < best) best = r;
        }
      }
      const tExit = Math.min(tMaxX, tMaxZ);
      if (best <= tExit || tExit > maxDist) break;
      if (tMaxX < tMaxZ) {
        cx += stepX;
        tMaxX += tDeltaX;
      } else {
        cz += stepZ;
        tMaxZ += tDeltaZ;
      }
    }
  }

  return { cellSize, insert, remove, query, alongRay };
}

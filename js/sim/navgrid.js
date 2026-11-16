// Ground-level navigation grid (1 m cells) and A* pathfinding for bots.
// A cell is blocked when a box rises through walking height there (walls, trees, rocks,
// containers, chests). Low steps and overhead slabs don't block. Upper floors aren't mapped.

// Every cell a blocking box overlaps is blocked, so even thin walls always register.
// Buildings are placed on half-metre origins (see mapgen), which puts each 1.6 m doorway's
// centre in the middle of a 1 m cell: exactly one free cell per doorway.
const BLOCKED = 1;
const WATER = 2;
const SQRT2 = Math.SQRT2;

export function buildNavGrid(world, { cellSize = 1 } = {}) {
  const terrain = world.terrain;
  const half = terrain.size / 2;
  const cols = Math.round(terrain.size / cellSize);
  const grid = new Uint8Array(cols * cols);
  const nav = {
    cols, cellSize, half, grid,
    g: new Float32Array(cols * cols),
    parent: new Int32Array(cols * cols),
    stamp: new Uint32Array(cols * cols),
    closed: new Uint32Array(cols * cols),
    search: 0,
    heap: new Int32Array(1 << 16),
    heapF: new Float32Array(1 << 16),
  };

  // Water and the map border
  for (let j = 0; j < cols; j++) {
    for (let i = 0; i < cols; i++) {
      const x = -half + (i + 0.5) * cellSize;
      const z = -half + (j + 0.5) * cellSize;
      if (i < 3 || j < 3 || i >= cols - 3 || j >= cols - 3) grid[j * cols + i] = BLOCKED;
      else if (world.waterLevel !== undefined && terrain.heightAt(x, z) < world.waterLevel - 0.6) grid[j * cols + i] = WATER;
    }
  }

  for (const b of world.boxes) markBox(nav, terrain, b);
  return nav;
}

/** Mark the cells a box blocks (call again for boxes added later, e.g. built walls). */
export function markBox(nav, terrain, b) {
  const { cols, cellSize, half, grid } = nav;
  const g = terrain.heightAt((b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2);
  if (b.maxY <= g + 0.5 || b.minY >= g + 1.7) return;
  const i0 = Math.max(0, Math.floor((b.minX + half) / cellSize));
  const i1 = Math.min(cols - 1, Math.floor((b.maxX + half) / cellSize - 1e-9));
  const j0 = Math.max(0, Math.floor((b.minZ + half) / cellSize));
  const j1 = Math.min(cols - 1, Math.floor((b.maxZ + half) / cellSize - 1e-9));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) grid[j * cols + i] = BLOCKED;
}

const cellOf = (nav, v) => Math.floor((v + nav.half) / nav.cellSize);
const centerOf = (nav, i) => -nav.half + (i + 0.5) * nav.cellSize;

export function isWalkable(nav, x, z) {
  const i = cellOf(nav, x);
  const j = cellOf(nav, z);
  if (i < 0 || j < 0 || i >= nav.cols || j >= nav.cols) return false;
  return nav.grid[j * nav.cols + i] !== BLOCKED;
}

/** True if a straight walk from a to b crosses no blocked cell. */
export function lineWalkable(nav, ax, az, bx, bz) {
  const len = Math.hypot(bx - ax, bz - az);
  const steps = Math.max(1, Math.ceil(len / (nav.cellSize * 0.4)));
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    if (!isWalkable(nav, ax + (bx - ax) * t, az + (bz - az) * t)) return false;
  }
  return true;
}

function nearestFree(nav, i, j, radius = 4) {
  const { cols, grid } = nav;
  if (i >= 0 && j >= 0 && i < cols && j < cols && grid[j * cols + i] !== BLOCKED) return j * cols + i;
  for (let r = 1; r <= radius; r++) {
    for (let dj = -r; dj <= r; dj++) {
      for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const ii = i + di;
        const jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= cols || jj >= cols) continue;
        if (grid[jj * cols + ii] !== BLOCKED) return jj * cols + ii;
      }
    }
  }
  return -1;
}

// Binary min-heap on f values
function heapPush(nav, size, node, f) {
  if (size >= nav.heap.length) {
    const h = new Int32Array(nav.heap.length * 2);
    h.set(nav.heap);
    const hf = new Float32Array(nav.heap.length * 2);
    hf.set(nav.heapF);
    nav.heap = h;
    nav.heapF = hf;
  }
  const heap = nav.heap;
  const hf = nav.heapF;
  let k = size;
  while (k > 0) {
    const p = (k - 1) >> 1;
    if (hf[p] <= f) break;
    heap[k] = heap[p];
    hf[k] = hf[p];
    k = p;
  }
  heap[k] = node;
  hf[k] = f;
}

function heapPop(nav, size) {
  const heap = nav.heap;
  const hf = nav.heapF;
  const top = heap[0];
  const last = heap[size - 1];
  const lf = hf[size - 1];
  const n = size - 1;
  let k = 0;
  while (true) {
    let c = 2 * k + 1;
    if (c >= n) break;
    if (c + 1 < n && hf[c + 1] < hf[c]) c++;
    if (hf[c] >= lf) break;
    heap[k] = heap[c];
    hf[k] = hf[c];
    k = c;
  }
  heap[k] = last;
  hf[k] = lf;
  return top;
}

const DIRS = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, SQRT2], [1, -1, SQRT2], [-1, 1, SQRT2], [-1, -1, SQRT2],
];

/**
 * A* from (sx, sz) to (tx, tz). Returns smoothed waypoints [{x, z}, ...] ending at the
 * goal, or the reachable point closest to it if the goal is blocked off. Null if hopeless.
 */
export function findPath(nav, sx, sz, tx, tz, maxNodes = 12000) {
  const { cols, grid, g, parent, stamp, closed } = nav;
  const start = nearestFree(nav, cellOf(nav, sx), cellOf(nav, sz));
  const goal = nearestFree(nav, cellOf(nav, tx), cellOf(nav, tz), 6);
  if (start < 0) return null;
  const gi = goal >= 0 ? goal % cols : cellOf(nav, tx);
  const gj = goal >= 0 ? Math.floor(goal / cols) : cellOf(nav, tz);

  const search = ++nav.search;
  const h = (n) => {
    const dx = Math.abs((n % cols) - gi);
    const dz = Math.abs(Math.floor(n / cols) - gj);
    return dx + dz + (SQRT2 - 2) * Math.min(dx, dz);
  };

  stamp[start] = search;
  g[start] = 0;
  parent[start] = -1;
  let size = 0;
  heapPush(nav, size++, start, h(start));
  let best = start;
  let bestH = h(start);
  let expanded = 0;
  let found = -1;

  while (size > 0 && expanded < maxNodes) {
    const n = heapPop(nav, size--);
    if (closed[n] === search) continue;
    closed[n] = search;
    expanded++;
    if (n === goal) {
      found = n;
      break;
    }
    const hn = h(n);
    if (hn < bestH) {
      bestH = hn;
      best = n;
    }
    const ni = n % cols;
    const nj = Math.floor(n / cols);
    for (const [di, dj, cost] of DIRS) {
      const ii = ni + di;
      const jj = nj + dj;
      if (ii < 0 || jj < 0 || ii >= cols || jj >= cols) continue;
      const m = jj * cols + ii;
      const cell = grid[m];
      if (cell === BLOCKED) continue;
      // no cutting corners
      if (di && dj && (grid[nj * cols + ii] === BLOCKED || grid[jj * cols + ni] === BLOCKED)) continue;
      const ng = g[n] + cost * (cell === WATER ? 3 : 1);
      if (stamp[m] === search && (closed[m] === search || ng >= g[m])) continue;
      stamp[m] = search;
      g[m] = ng;
      parent[m] = n;
      heapPush(nav, size++, m, ng + h(m) * 1.05);
    }
  }

  const end = found >= 0 ? found : best;
  if (end === start && found < 0) return null;
  const cells = [];
  for (let n = end; n !== -1; n = parent[n]) cells.push(n);
  cells.reverse();
  const pts = cells.map((n) => ({ x: centerOf(nav, n % cols), z: centerOf(nav, Math.floor(n / cols)) }));
  if (found >= 0 && isWalkable(nav, tx, tz) && lineWalkable(nav, pts[pts.length - 1].x, pts[pts.length - 1].z, tx, tz)) {
    pts.push({ x: tx, z: tz });
  }
  return smooth(nav, pts);
}

/** Drop waypoints that can be skipped with a straight walk. */
function smooth(nav, pts) {
  if (pts.length <= 2) return pts;
  const out = [pts[0]];
  let i = 0;
  while (i < pts.length - 1) {
    let j = Math.min(pts.length - 1, i + 48);
    while (j > i + 1 && !lineWalkable(nav, pts[i].x, pts[i].z, pts[j].x, pts[j].z)) j--;
    out.push(pts[j]);
    i = j;
  }
  return out;
}

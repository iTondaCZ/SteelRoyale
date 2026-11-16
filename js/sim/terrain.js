// Heightfield terrain. The map spans [−size/2, size/2] on X and Z.
// heightAt() interpolates on the same two triangles per cell that the render mesh draws
// (split along the (ix, iz) → (ix+1, iz+1) diagonal), so physics and visuals match exactly.
import { clamp, smoothstep } from './vec.js';

export function createTerrain({ size, cellSize = 2, heightFn = () => 0 }) {
  const cols = Math.round(size / cellSize) + 1;
  const half = size / 2;
  const heights = new Float32Array(cols * cols);
  for (let iz = 0; iz < cols; iz++) {
    for (let ix = 0; ix < cols; ix++) {
      heights[iz * cols + ix] = heightFn(-half + ix * cellSize, -half + iz * cellSize);
    }
  }

  let maxHeight = -Infinity;
  const updateMax = () => {
    maxHeight = -Infinity;
    for (let i = 0; i < heights.length; i++) if (heights[i] > maxHeight) maxHeight = heights[i];
  };
  updateMax();

  function heightAt(x, z) {
    const fx = clamp((x + half) / cellSize, 0, cols - 1);
    const fz = clamp((z + half) / cellSize, 0, cols - 1);
    let ix = Math.floor(fx);
    let iz = Math.floor(fz);
    if (ix > cols - 2) ix = cols - 2;
    if (iz > cols - 2) iz = cols - 2;
    const tx = fx - ix;
    const tz = fz - iz;
    const i = iz * cols + ix;
    const h00 = heights[i];
    const h10 = heights[i + 1];
    const h01 = heights[i + cols];
    const h11 = heights[i + cols + 1];
    if (tx >= tz) return h00 + (h10 - h00) * tx + (h11 - h10) * tz;
    return h00 + (h11 - h01) * tx + (h01 - h00) * tz;
  }

  /**
   * Flatten a w×d rectangle centred on (cx, cz) to height h, blending back to the
   * original terrain over `blend` metres. Whole cells touching the zone are flattened
   * so every point inside the rectangle is exactly h.
   */
  function flatten(cx, cz, w, d, h, blend = 4) {
    const x0 = cx - w / 2 - cellSize;
    const x1 = cx + w / 2 + cellSize;
    const z0 = cz - d / 2 - cellSize;
    const z1 = cz + d / 2 + cellSize;
    const ixa = Math.max(0, Math.floor((x0 - blend + half) / cellSize));
    const ixb = Math.min(cols - 1, Math.ceil((x1 + blend + half) / cellSize));
    const iza = Math.max(0, Math.floor((z0 - blend + half) / cellSize));
    const izb = Math.min(cols - 1, Math.ceil((z1 + blend + half) / cellSize));
    for (let iz = iza; iz <= izb; iz++) {
      for (let ix = ixa; ix <= ixb; ix++) {
        const vx = -half + ix * cellSize;
        const vz = -half + iz * cellSize;
        const dx = Math.max(x0 - vx, 0, vx - x1);
        const dz = Math.max(z0 - vz, 0, vz - z1);
        const dist = Math.hypot(dx, dz);
        const i = iz * cols + ix;
        if (dist <= 0) heights[i] = h;
        else if (dist < blend) heights[i] = h + (heights[i] - h) * smoothstep(dist / blend);
      }
    }
    updateMax();
  }

  return {
    size,
    cellSize,
    cols,
    half,
    heights,
    heightAt,
    flatten,
    get maxHeight() {
      return maxHeight;
    },
  };
}

// Top-down map picture (for the minimap and the full map), drawn once per match.

const SURFACE_RGB = [null, [176, 152, 112], [150, 124, 88], [160, 160, 154], [186, 178, 160], [154, 149, 138]];

/** Returns a canvas `px` pixels wide showing the whole map, north (−Z) up. */
export function renderMapImage(map, px = 512) {
  const canvas = document.createElement('canvas');
  canvas.width = px;
  canvas.height = px;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(px, px);
  const { terrain } = map;
  const size = terrain.size;
  const half = size / 2;
  const water = map.waterLevel;
  const step = size / px;

  for (let py = 0; py < px; py++) {
    for (let pxi = 0; pxi < px; pxi++) {
      const x = -half + (pxi + 0.5) * step;
      const z = -half + (py + 0.5) * step;
      const h = terrain.heightAt(x, z);
      let r;
      let g;
      let b;
      const surf = map.surface ? map.surface[Math.round((z + half) / terrain.cellSize) * terrain.cols + Math.round((x + half) / terrain.cellSize)] : 0;
      if (water !== undefined && h < water) {
        const depth = Math.min(1, (water - h) / 1.5);
        r = 70 - depth * 30;
        g = 150 - depth * 40;
        b = 190 - depth * 20;
      } else if (surf) {
        [r, g, b] = SURFACE_RGB[surf];
      } else if (water !== undefined && h < water + 1.6) {
        r = 216;
        g = 198;
        b = 144;
      } else if (h > 44) {
        r = 225;
        g = 230;
        b = 234;
      } else if (h > 32) {
        r = 128;
        g = 124;
        b = 116;
      } else {
        const t = Math.min(1, h / 30);
        r = 104 + t * 30;
        g = 150 - t * 10;
        b = 70;
      }
      // Hill shading from the slope toward the north-west light.
      const shade = (terrain.heightAt(x - step, z - step) - terrain.heightAt(x + step, z + step)) * 4;
      const k = Math.max(0.65, Math.min(1.25, 1 + shade / 40));
      const i = (py * px + pxi) * 4;
      img.data[i] = Math.min(255, r * k);
      img.data[i + 1] = Math.min(255, g * k);
      img.data[i + 2] = Math.min(255, b * k);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  // Buildings
  const toPx = (v) => ((v + half) / size) * px;
  ctx.fillStyle = 'rgba(40, 44, 50, 0.85)';
  for (const bld of map.buildings || []) {
    ctx.fillRect(toPx(bld.originX), toPx(bld.originZ), Math.max(1.5, (bld.w / size) * px), Math.max(1.5, (bld.d / size) * px));
  }
  ctx.fillStyle = 'rgba(60, 70, 80, 0.8)';
  for (const c of map.containers || []) {
    if (c.level) continue;
    ctx.fillRect(toPx(c.minX), toPx(c.minZ), Math.max(1, ((c.maxX - c.minX) / size) * px), Math.max(1, ((c.maxZ - c.minZ) / size) * px));
  }
  return canvas;
}

/** Convert a world position to canvas pixels for a map image of `px` pixels. */
export function worldToMap(map, x, z, px) {
  const size = map.terrain.size;
  return { x: ((x + size / 2) / size) * px, y: ((z + size / 2) / size) * px };
}

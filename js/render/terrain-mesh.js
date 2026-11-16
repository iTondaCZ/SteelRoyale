// Low-poly terrain built from the simulation heightfield (same triangles as heightAt),
// split into chunks so the camera can skip what it can't see, plus sea/lake water.
import * as THREE from 'three';

const C = {
  grassA: new THREE.Color('#6b9b45'),
  grassB: new THREE.Color('#82ad52'),
  dry: new THREE.Color('#a5a35e'),
  sand: new THREE.Color('#d8c690'),
  seabed: new THREE.Color('#b9a77a'),
  dirt: new THREE.Color('#8c7350'),
  road: new THREE.Color('#9b8463'),
  concrete: new THREE.Color('#9a9a94'),
  plaza: new THREE.Color('#b3aa98'),
  gravel: new THREE.Color('#9a958a'),
  rock: new THREE.Color('#7f7b74'),
  snow: new THREE.Color('#e9eef2'),
};
const SURFACE_COLORS = [null, C.road, C.dirt, C.concrete, C.plaza, C.gravel];

const hash = (x, z) => {
  const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return s - Math.floor(s);
};

/**
 * surfaceAt(i, j, x, z) → index into SURFACE_COLORS (0 = natural ground).
 * waterLevel: undefined for no water.
 */
export function createTerrainMesh(terrain, { surfaceAt = () => 0, waterLevel, chunkCells = 50 } = {}) {
  const { cols, cellSize, half, heights } = terrain;
  const group = new THREE.Group();

  // Per-vertex normals (from neighbours) and colours, computed once for the whole map.
  const ny = new Float32Array(cols * cols);
  for (let j = 0; j < cols; j++) {
    for (let i = 0; i < cols; i++) {
      const hl = heights[j * cols + Math.max(0, i - 1)];
      const hr = heights[j * cols + Math.min(cols - 1, i + 1)];
      const hd = heights[Math.max(0, j - 1) * cols + i];
      const hu = heights[Math.min(cols - 1, j + 1) * cols + i];
      const dx = (hr - hl) / (2 * cellSize);
      const dz = (hu - hd) / (2 * cellSize);
      ny[j * cols + i] = 1 / Math.sqrt(dx * dx + dz * dz + 1);
    }
  }
  const colors = new Float32Array(cols * cols * 3);
  const c = new THREE.Color();
  for (let j = 0; j < cols; j++) {
    for (let i = 0; i < cols; i++) {
      const k = j * cols + i;
      const x = -half + i * cellSize;
      const z = -half + j * cellSize;
      const h = heights[k];
      const n = hash(i, j);
      const surface = surfaceAt(i, j, x, z);
      if (surface) {
        c.copy(SURFACE_COLORS[surface]).offsetHSL(0, 0, (n - 0.5) * 0.04);
      } else if (waterLevel !== undefined && h < waterLevel + 0.3) {
        c.copy(C.seabed).lerp(C.sand, Math.max(0, Math.min(1, (h - waterLevel + 1.4) / 1.7)));
      } else if (waterLevel !== undefined && h < waterLevel + 1.6) {
        c.copy(C.sand).offsetHSL(0, 0, (n - 0.5) * 0.04);
      } else {
        c.copy(C.grassA).lerp(C.grassB, n);
        if (hash(i * 0.37, j * 0.91) > 0.86) c.lerp(C.dry, 0.6);
        const slope = 1 - ny[k];
        if (slope > 0.18) c.lerp(C.rock, Math.min(1, (slope - 0.18) * 4));
        if (h > 34) c.lerp(C.rock, Math.min(1, (h - 34) / 8));
        if (h > 46) c.lerp(C.snow, Math.min(1, (h - 46) / 6));
      }
      colors[k * 3] = c.r;
      colors[k * 3 + 1] = c.g;
      colors[k * 3 + 2] = c.b;
    }
  }

  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const cells = cols - 1;
  for (let cj = 0; cj < cells; cj += chunkCells) {
    for (let ci = 0; ci < cells; ci += chunkCells) {
      const w = Math.min(chunkCells, cells - ci);
      const d = Math.min(chunkCells, cells - cj);
      const vc = (w + 1) * (d + 1);
      const pos = new Float32Array(vc * 3);
      const col = new Float32Array(vc * 3);
      for (let j = 0; j <= d; j++) {
        for (let i = 0; i <= w; i++) {
          const gi = ci + i;
          const gj = cj + j;
          const k = gj * cols + gi;
          const v = j * (w + 1) + i;
          pos[v * 3] = -half + gi * cellSize;
          pos[v * 3 + 1] = heights[k];
          pos[v * 3 + 2] = -half + gj * cellSize;
          col[v * 3] = colors[k * 3];
          col[v * 3 + 1] = colors[k * 3 + 1];
          col[v * 3 + 2] = colors[k * 3 + 2];
        }
      }
      const idx = new Uint32Array(w * d * 6);
      let q = 0;
      for (let j = 0; j < d; j++) {
        for (let i = 0; i < w; i++) {
          const a = j * (w + 1) + i;
          const b = a + 1;
          const cc = a + (w + 1);
          const dd = cc + 1;
          // Diagonal a→dd, matching terrain.heightAt()
          idx[q++] = a; idx[q++] = dd; idx[q++] = b;
          idx[q++] = a; idx[q++] = cc; idx[q++] = dd;
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geo.setIndex(new THREE.BufferAttribute(idx, 1));
      geo.computeVertexNormals();
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.receiveShadow = true;
      group.add(mesh);
    }
  }

  // Ground beyond the map edge, so the horizon never shows a void.
  let edgeMin = Infinity;
  for (let i = 0; i < cols; i++) {
    edgeMin = Math.min(edgeMin, heights[i], heights[(cols - 1) * cols + i], heights[i * cols], heights[i * cols + cols - 1]);
  }
  const outer = new THREE.Mesh(
    new THREE.PlaneGeometry(8000, 8000).rotateX(-Math.PI / 2),
    new THREE.MeshLambertMaterial({ color: waterLevel !== undefined ? '#b9a77a' : '#5f8a3f' }),
  );
  outer.position.y = edgeMin - 0.2;
  group.add(outer);

  if (waterLevel !== undefined) {
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(8000, 8000).rotateX(-Math.PI / 2),
      new THREE.MeshLambertMaterial({ color: '#2f7fa8', transparent: true, opacity: 0.78, depthWrite: false }),
    );
    water.position.y = waterLevel;
    water.renderOrder = 1;
    group.add(water);
  }
  return group;
}

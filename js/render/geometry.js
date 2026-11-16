// Helpers to bake several coloured parts into one non-indexed geometry with vertex colours.
import * as THREE from 'three';

const _color = new THREE.Color();

/**
 * parts: [{ geometry, color, matrix? }] → one BufferGeometry (position, normal, color).
 * Input geometries are disposed.
 */
export function bakeParts(parts) {
  const prepared = parts.map(({ geometry, color, matrix }) => {
    let g = geometry.index ? geometry.toNonIndexed() : geometry;
    if (g !== geometry) geometry.dispose();
    if (matrix) g.applyMatrix4(matrix);
    if (!g.attributes.normal) g.computeVertexNormals();
    return { g, color };
  });
  const total = prepared.reduce((n, p) => n + p.g.attributes.position.count, 0);
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const col = new Float32Array(total * 3);
  let offset = 0;
  for (const { g, color } of prepared) {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array, offset * 3);
    nor.set(g.attributes.normal.array, offset * 3);
    _color.set(color);
    for (let i = 0; i < n; i++) {
      col[(offset + i) * 3] = _color.r;
      col[(offset + i) * 3 + 1] = _color.g;
      col[(offset + i) * 3 + 2] = _color.b;
    }
    offset += n;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeBoundingSphere();
  out.computeBoundingBox();
  return out;
}

/** Bake simulation boxes ({minX..maxZ}) with colours into one geometry. */
export function bakeBoxes(items) {
  const m = new THREE.Matrix4();
  return bakeParts(
    items.map(({ box, color }) => {
      const w = box.maxX - box.minX;
      const h = box.maxY - box.minY;
      const d = box.maxZ - box.minZ;
      m.makeTranslation((box.minX + box.maxX) / 2, (box.minY + box.maxY) / 2, (box.minZ + box.maxZ) / 2);
      return { geometry: new THREE.BoxGeometry(w, h, d), color, matrix: m.clone() };
    }),
  );
}

let _vcMaterial = null;
/** Shared flat-shaded material that uses vertex colours. */
export function vertexColorMaterial() {
  if (!_vcMaterial) _vcMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  return _vcMaterial;
}

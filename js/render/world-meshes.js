// Static world visuals: buildings and props merged per 200 m chunk, trees and rocks instanced
// per chunk (so camera and shadow frustums can skip far ones), plus chests.
import * as THREE from 'three';
import { bakeBoxes, bakeParts, vertexColorMaterial } from './geometry.js';
import { CHEST_SIZE } from '../sim/loot.js';

const CHUNK = 200;
const STYLE = {
  house: {
    walls: ['#cfc6b4', '#b9a387', '#9aa6ae', '#a8573c', '#d8d0bf', '#86927d', '#c9b27c', '#8c9fb5'],
    roof: ['#434a52', '#6b3b2e', '#3e4f5e', '#57534e'],
    floor: '#7a6450',
    interior: '#e3ddd0',
  },
  warehouse: { walls: ['#7d8b96', '#5e6f7d', '#8a8f86'], roof: ['#3a434b'], floor: '#8d8d88', interior: '#9aa3ab' },
  barn: { walls: ['#9b3a2e', '#8a3328'], roof: ['#4a3b32'], floor: '#7a6450', interior: '#b8a07a' },
  shed: { walls: ['#8a6a48', '#6f5a43'], roof: ['#4a4f55'], floor: '#6e5b48', interior: '#8a6a48' },
};
const STEP_COLOR = '#6e5b48';
const CONTAINER_COLORS = ['#b5452f', '#2f6fb5', '#3f8f4a', '#c98a2b', '#6b6f75'];
const CRATE_COLORS = ['#8a6a3d', '#5d6b78'];

const chunkKey = (x, z) => `${Math.floor(x / CHUNK)},${Math.floor(z / CHUNK)}`;

function groupBy(list, fn) {
  const map = new Map();
  for (const item of list) {
    const k = fn(item);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(item);
  }
  return map;
}

export function createWorldMeshes(scene, map) {
  const group = new THREE.Group();
  scene.add(group);

  // --- Buildings, crates and containers: one merged mesh per chunk ---
  const boxItems = [];
  for (const b of map.buildings) {
    const style = STYLE[b.kind] || STYLE.house;
    const wall = style.walls[b.id % style.walls.length];
    const roof = style.roof[b.id % style.roof.length];
    for (const p of b.pieces) {
      const color =
        p.type === 'floor' ? style.floor : p.type === 'roof' ? roof : p.type === 'step' ? STEP_COLOR : p.interior ? style.interior : wall;
      for (const box of p.boxes) boxItems.push({ box, color });
    }
  }
  (map.crates || []).forEach((box, i) => boxItems.push({ box, color: CRATE_COLORS[i % 2] }));
  for (const box of map.containers || []) boxItems.push({ box, color: CONTAINER_COLORS[(box.color || 0) % CONTAINER_COLORS.length] });

  for (const items of groupBy(boxItems, ({ box }) => chunkKey((box.minX + box.maxX) / 2, (box.minZ + box.maxZ) / 2)).values()) {
    const mesh = new THREE.Mesh(bakeBoxes(items), vertexColorMaterial());
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  // --- Trees and rocks: instanced per chunk ---
  const m = new THREE.Matrix4();
  const pineGeo = bakeParts([
    { geometry: new THREE.CylinderGeometry(0.16, 0.24, 2.4, 6), color: '#6b4a32', matrix: m.clone().makeTranslation(0, 1.2, 0) },
    { geometry: new THREE.ConeGeometry(1.9, 3.2, 7), color: '#2f6a3b', matrix: m.clone().makeTranslation(0, 3.6, 0) },
    { geometry: new THREE.ConeGeometry(1.35, 2.6, 7), color: '#3b7c45', matrix: m.clone().makeTranslation(0, 5.2, 0) },
    { geometry: new THREE.ConeGeometry(0.8, 1.8, 7), color: '#4a8c4f', matrix: m.clone().makeTranslation(0, 6.6, 0) },
  ]);
  const roundGeo = bakeParts([
    { geometry: new THREE.CylinderGeometry(0.18, 0.26, 3, 6), color: '#73513a', matrix: m.clone().makeTranslation(0, 1.5, 0) },
    { geometry: new THREE.IcosahedronGeometry(2.1, 0), color: '#5b9a3c', matrix: m.clone().makeTranslation(0, 4.2, 0) },
    { geometry: new THREE.IcosahedronGeometry(1.3, 0), color: '#6aa845', matrix: m.clone().makeTranslation(0.9, 5.2, 0.4) },
  ]);
  const rockGeo = bakeParts([{ geometry: new THREE.DodecahedronGeometry(1, 0), color: '#8b8a86' }]);

  for (const list of groupBy(map.trees, (t) => chunkKey(t.x, t.z)).values()) {
    addInstances(group, pineGeo, list.filter((t) => t.type === 'pine'));
    addInstances(group, roundGeo, list.filter((t) => t.type === 'round'));
  }
  for (const list of groupBy(map.rocks, (r) => chunkKey(r.x, r.z)).values()) {
    addInstances(group, rockGeo, list, (r, pos, scale) => {
      pos.y = r.y + r.s * 0.15;
      scale.set(r.s, r.s * 0.75, r.s * 0.9);
    });
  }

  const chests = createChestView(group, map.world.loot.chests);
  return { group, chests };
}

function addInstances(group, geometry, list, place) {
  if (!list.length) return null;
  const mesh = new THREE.InstancedMesh(geometry, vertexColorMaterial(), list.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const pos = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const tint = new THREE.Color();
  list.forEach((item, i) => {
    pos.set(item.x, item.y, item.z);
    scale.setScalar(item.s);
    if (place) place(item, pos, scale);
    q.setFromAxisAngle(up, item.rot || 0);
    m.compose(pos, q, scale);
    mesh.setMatrixAt(i, m);
    const v = 0.88 + ((i * 0.618) % 1) * 0.22;
    mesh.setColorAt(i, tint.setRGB(v, v, v));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.computeBoundingSphere();
  group.add(mesh);
  return mesh;
}

/** Chests: instanced bodies, lids and glinting trim. Call opened(chest) when one opens. */
function createChestView(group, chests) {
  const count = Math.max(1, chests.length);
  const box = new THREE.BoxGeometry(1, 1, 1);
  const body = new THREE.InstancedMesh(box, new THREE.MeshLambertMaterial({ flatShading: true }), count);
  const lid = new THREE.InstancedMesh(box, new THREE.MeshLambertMaterial({ flatShading: true }), count);
  const trim = new THREE.InstancedMesh(box, new THREE.MeshBasicMaterial(), count * 2);
  for (const im of [body, lid, trim]) {
    im.castShadow = im !== trim;
    im.receiveShadow = true;
    group.add(im);
  }
  const W = CHEST_SIZE.w;
  const H = CHEST_SIZE.h;
  const D = CHEST_SIZE.d;
  const base = new THREE.Matrix4();
  const m = new THREE.Matrix4();
  const tmp = new THREE.Matrix4();
  const color = new THREE.Color();

  function place(chest, i) {
    base.makeRotationY(chest.yaw).setPosition(chest.x, chest.y, chest.z);
    // body
    m.copy(base).multiply(tmp.makeTranslation(0, H * 0.36, 0)).multiply(tmp.makeScale(W, H * 0.72, D));
    body.setMatrixAt(i, m);
    body.setColorAt(i, color.set(chest.vault ? '#3b4148' : '#7a5230'));
    // lid hinged at the back (local −Z), opens backwards
    const angle = chest.opened ? -1.9 : 0;
    m.copy(base)
      .multiply(tmp.makeTranslation(0, H * 0.72, -D / 2))
      .multiply(tmp.makeRotationX(angle))
      .multiply(tmp.makeTranslation(0, H * 0.14, D / 2))
      .multiply(tmp.makeScale(W * 1.02, H * 0.28, D * 1.02));
    lid.setMatrixAt(i, m);
    lid.setColorAt(i, color.set(chest.vault ? '#2b3036' : '#6a4426'));
    // trim: front band + lock (bright while unopened)
    const glow = chest.opened ? '#5a4b26' : chest.vault ? '#ffcf4a' : '#f0b429';
    m.copy(base).multiply(tmp.makeTranslation(0, H * 0.62, D / 2 + 0.01)).multiply(tmp.makeScale(W * 1.04, 0.07, 0.03));
    trim.setMatrixAt(i * 2, m);
    trim.setColorAt(i * 2, color.set(glow));
    m.copy(base).multiply(tmp.makeTranslation(0, H * 0.52, D / 2 + 0.03)).multiply(tmp.makeScale(0.14, 0.18, 0.05));
    trim.setMatrixAt(i * 2 + 1, m);
    trim.setColorAt(i * 2 + 1, color.set(glow));
  }

  chests.forEach(place);
  body.count = chests.length;
  lid.count = chests.length;
  trim.count = chests.length * 2;
  for (const im of [body, lid, trim]) {
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.computeBoundingSphere();
  }

  return {
    opened(chest) {
      const i = chests.indexOf(chest);
      if (i < 0) return;
      place(chest, i);
      for (const im of [lid, trim]) {
        im.instanceMatrix.needsUpdate = true;
        im.instanceColor.needsUpdate = true;
      }
    },
  };
}

// Ground loot: weapons, consumables and ammo near the camera, spinning gently,
// with a rarity-coloured beam for Rare and better. Instanced per model type.
import * as THREE from 'three';
import { bakeParts } from './geometry.js';
import { GUNS, GUN_COLORS } from './crowd.js';
import { RARITY, CONSUMABLES, AMMO } from '../config.js';
import { lootInRadius } from '../sim/loot.js';

const RANGE = 75;
const MAX_PER_TYPE = 160;
const BEAM_RARITIES = new Set(['rare', 'epic', 'legendary']);

function gunGeometry(type, accent) {
  const m = new THREE.Matrix4();
  return bakeParts(
    GUNS[type].parts
      .filter((p) => (p[6] === 'accent') === accent)
      .map(([sx, sy, sz, ox, oy, oz, key]) => ({
        geometry: new THREE.BoxGeometry(sx, sy, sz),
        color: accent ? '#ffffff' : GUN_COLORS[key],
        matrix: m.clone().makeTranslation(ox, oy, oz),
      })),
  );
}

export function createLootView(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const lambert = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const meshes = new Map(); // model key -> InstancedMesh

  const make = (key, geometry, material = lambert) => {
    const im = new THREE.InstancedMesh(geometry, material, MAX_PER_TYPE);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    im.frustumCulled = false;
    im.castShadow = material === lambert;
    im.count = 0;
    group.add(im);
    meshes.set(key, im);
    return im;
  };

  for (const type of Object.keys(GUNS)) {
    make(`gun:${type}`, gunGeometry(type, false));
    const acc = make(`acc:${type}`, gunGeometry(type, true));
    acc.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PER_TYPE * 3), 3);
  }
  const m = new THREE.Matrix4();
  make('bandage', bakeParts([{ geometry: new THREE.CylinderGeometry(0.12, 0.12, 0.16, 8).rotateZ(Math.PI / 2), color: CONSUMABLES.bandage.color }]));
  make('medkit', bakeParts([
    { geometry: new THREE.BoxGeometry(0.42, 0.26, 0.3), color: CONSUMABLES.medkit.color },
    { geometry: new THREE.BoxGeometry(0.06, 0.2, 0.31), color: '#ffffff', matrix: m.clone().makeTranslation(0, 0, 0) },
    { geometry: new THREE.BoxGeometry(0.43, 0.06, 0.31), color: '#ffffff', matrix: m.clone().makeTranslation(0, 0, 0) },
  ]));
  make('shieldSmall', bakeParts([
    { geometry: new THREE.CylinderGeometry(0.09, 0.09, 0.26, 8), color: CONSUMABLES.shieldSmall.color },
    { geometry: new THREE.CylinderGeometry(0.05, 0.05, 0.06, 8), color: '#d8e6f0', matrix: m.clone().makeTranslation(0, 0.16, 0) },
  ]));
  make('shieldBig', bakeParts([
    { geometry: new THREE.CylinderGeometry(0.16, 0.16, 0.38, 10), color: CONSUMABLES.shieldBig.color },
    { geometry: new THREE.CylinderGeometry(0.08, 0.08, 0.08, 10), color: '#d8e6f0', matrix: m.clone().makeTranslation(0, 0.23, 0) },
  ]));
  const ammo = make('ammo', bakeParts([
    { geometry: new THREE.BoxGeometry(0.34, 0.2, 0.24), color: '#ffffff' },
  ]));
  ammo.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PER_TYPE * 3), 3);

  const beamMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false });
  const beams = make('beam', new THREE.CylinderGeometry(0.05, 0.12, 1, 6, 1, true).translate(0, 0.5, 0), beamMat);
  beams.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PER_TYPE * 3), 3);
  beams.castShadow = false;

  const near = [];
  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scale = new THREE.Vector3(1, 1, 1);
  const up = new THREE.Vector3(0, 1, 0);
  const color = new THREE.Color();

  return {
    group,
    update(world, camPos, time) {
      for (const im of meshes.values()) im.count = 0;
      near.length = 0;
      lootInRadius(world, camPos.x, camPos.z, RANGE, near);
      for (const loot of near) {
        const item = loot.item;
        const bob = loot.settled ? 0.25 + Math.sin(time * 2 + loot.id) * 0.06 : 0.1;
        pos.set(loot.pos.x, loot.pos.y + bob, loot.pos.z);
        q.setFromAxisAngle(up, loot.spin + time * 0.8);
        m.compose(pos, q, scale);
        let key;
        if (item.kind === 'weapon') key = `gun:${item.type}`;
        else if (item.kind === 'consumable') key = item.type;
        else key = 'ammo';
        const im = meshes.get(key);
        if (!im || im.count >= MAX_PER_TYPE) continue;
        im.setMatrixAt(im.count, m);
        if (key === 'ammo') im.setColorAt(im.count, color.set(AMMO[item.ammoType].color));
        im.count++;
        if (item.kind === 'weapon') {
          const acc = meshes.get(`acc:${item.type}`);
          acc.setMatrixAt(acc.count, m);
          acc.setColorAt(acc.count, color.set(RARITY[item.rarity].color));
          acc.count++;
          if (BEAM_RARITIES.has(item.rarity) && beams.count < MAX_PER_TYPE) {
            m.compose(pos.set(loot.pos.x, loot.pos.y, loot.pos.z), q.identity(), scale.set(1, item.rarity === 'legendary' ? 9 : 6, 1));
            beams.setMatrixAt(beams.count, m);
            beams.setColorAt(beams.count, color.set(RARITY[item.rarity].color));
            beams.count++;
            scale.set(1, 1, 1);
          }
        }
      }
      for (const im of meshes.values()) {
        if (!im.count) continue;
        im.instanceMatrix.needsUpdate = true;
        if (im.instanceColor) im.instanceColor.needsUpdate = true;
      }
    },
  };
}

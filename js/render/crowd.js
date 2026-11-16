// Draws every character with ONE InstancedMesh of unit cubes (one draw call for 100 players).
// A single bone rig is posed per character, and each body/gun part becomes one instance.
import * as THREE from 'three';
import { RARITY, CONSUMABLES } from '../config.js';

const MAX_PARTS = 2800;
const DRAW_DISTANCE = 360;
const CORPSE_TIME = 8;

const SKIN = ['#e0b08a', '#c68b5f', '#8d5a3b', '#f0c9a4', '#a86f4c'];
const TORSO = ['#2f6fb5', '#b5452f', '#3f8f4a', '#8a3fb5', '#c98a2b', '#2a8f8f', '#6b6f75', '#b53f74', '#4b5bb5', '#7a8f2a'];
const LEGS = ['#2b2f36', '#3b3428', '#283840', '#3a2d3f', '#2f3a2a', '#4a4a4a'];
const ACCENT = ['#ff7a1a', '#ffd23f', '#e8e8e8', '#38c6f4', '#ff4d6d'];

const PLAYER_OUTFIT = { torso: '#2f6fb5', legs: '#2b2f36', skin: '#d6a47a', accent: '#ff7a1a', visor: '#1b1f24' };
const DUMMY_OUTFIT = { torso: '#ff7a1a', legs: '#4a525c', skin: '#9aa3ab', accent: '#ffd23f', visor: '#23282e' };

function outfitFor(c) {
  if (c.kind === 'player') return PLAYER_OUTFIT;
  if (c.kind === 'dummy') return DUMMY_OUTFIT;
  const h = (c.id * 2654435761) >>> 0;
  return {
    torso: TORSO[h % TORSO.length],
    legs: LEGS[(h >>> 4) % LEGS.length],
    skin: SKIN[(h >>> 8) % SKIN.length],
    accent: ACCENT[(h >>> 12) % ACCENT.length],
    visor: '#1b1f24',
  };
}

// Gun models: parts relative to the gun node (z forward is −Z). 'accent' parts take the rarity colour.
const GUNS = {
  pistol: { muzzle: -0.3, parts: [[0.06, 0.1, 0.3, 0, 0, -0.1, 'metal'], [0.05, 0.15, 0.07, 0, -0.1, 0.0, 'dark'], [0.065, 0.03, 0.2, 0, 0.06, -0.12, 'accent']] },
  smg: { muzzle: -0.55, parts: [[0.07, 0.12, 0.55, 0, 0, -0.15, 'metal'], [0.05, 0.2, 0.06, 0, -0.15, -0.12, 'dark'], [0.05, 0.14, 0.07, 0, -0.1, 0.06, 'dark'], [0.075, 0.03, 0.3, 0, 0.075, -0.15, 'accent']] },
  ar: { muzzle: -0.78, parts: [[0.08, 0.13, 0.82, 0, 0, -0.1, 'metal'], [0.06, 0.17, 0.08, 0, -0.13, -0.18, 'dark'], [0.06, 0.16, 0.08, 0, -0.12, 0.05, 'dark'], [0.045, 0.045, 0.22, 0, 0.02, -0.62, 'dark'], [0.085, 0.035, 0.4, 0, 0.08, -0.15, 'accent']] },
  shotgun: { muzzle: -0.82, parts: [[0.09, 0.12, 0.9, 0, 0, -0.12, 'wood'], [0.07, 0.07, 0.55, 0, 0.07, -0.35, 'metal'], [0.1, 0.08, 0.22, 0, -0.06, -0.38, 'dark'], [0.095, 0.03, 0.25, 0, -0.03, 0.15, 'accent']] },
  sniper: { muzzle: -1.05, parts: [[0.08, 0.12, 1.0, 0, 0, -0.15, 'metal'], [0.04, 0.04, 0.35, 0, 0.02, -0.82, 'dark'], [0.06, 0.07, 0.32, 0, 0.12, -0.12, 'dark'], [0.06, 0.15, 0.08, 0, -0.12, 0.05, 'dark'], [0.085, 0.03, 0.35, 0, -0.06, -0.3, 'accent']] },
  rocket: { muzzle: -0.75, parts: [[0.17, 0.17, 1.15, 0, 0.04, -0.15, 'olive'], [0.06, 0.16, 0.08, 0, -0.12, -0.05, 'dark'], [0.19, 0.19, 0.08, 0, 0.04, -0.7, 'accent'], [0.19, 0.19, 0.08, 0, 0.04, 0.4, 'accent']] },
};
const GUN_COLORS = { metal: '#3a4047', dark: '#1e2226', wood: '#7a5230', olive: '#5b6b3a' };

export function createCrowd(scene) {
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshLambertMaterial({ flatShading: true });
  const mesh = new THREE.InstancedMesh(geo, mat, MAX_PARTS);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PARTS * 3), 3);
  mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  mesh.count = 0;
  scene.add(mesh);

  // ---- Rig (posed once per character, then read back) ----
  const root = new THREE.Object3D();
  const body = new THREE.Object3D();
  root.add(body);
  const hips = new THREE.Object3D();
  body.add(hips);
  const legL = new THREE.Object3D();
  const legR = new THREE.Object3D();
  legL.position.set(-0.14, 0, 0);
  legR.position.set(0.14, 0, 0);
  hips.add(legL, legR);
  const upper = new THREE.Object3D();
  hips.add(upper);
  const head = new THREE.Object3D();
  head.position.y = 0.66;
  upper.add(head);
  const armL = new THREE.Object3D();
  const armR = new THREE.Object3D();
  armL.position.set(-0.36, 0.6, 0);
  armR.position.set(0.36, 0.6, 0);
  upper.add(armL, armR);
  const gun = new THREE.Object3D();
  gun.position.set(0.2, 0.46, -0.32);
  upper.add(gun);
  const hand = new THREE.Object3D(); // held consumable
  hand.position.set(0.1, 0.3, -0.35);
  upper.add(hand);

  // [node, sx, sy, sz, ox, oy, oz, colourKey]
  const BODY_PARTS = [
    [legL, 0.22, 0.9, 0.26, 0, -0.45, 0, 'legs'],
    [legR, 0.22, 0.9, 0.26, 0, -0.45, 0, 'legs'],
    [legL, 0.24, 0.12, 0.32, 0, -0.86, -0.04, 'boots'],
    [legR, 0.24, 0.12, 0.32, 0, -0.86, -0.04, 'boots'],
    [upper, 0.58, 0.64, 0.32, 0, 0.36, 0, 'torso'],
    [upper, 0.6, 0.1, 0.34, 0, 0.1, 0, 'accent'],
    [head, 0.34, 0.34, 0.34, 0, 0.2, 0, 'skin'],
    [head, 0.3, 0.1, 0.04, 0, 0.24, -0.18, 'visor'],
    [armL, 0.15, 0.6, 0.15, 0, -0.28, 0, 'torso'],
    [armR, 0.15, 0.6, 0.15, 0, -0.28, 0, 'torso'],
  ];

  const states = new Map(); // id -> { phase, deathT, crouchT, outfit, colors }
  const muzzles = new Map(); // id -> THREE.Vector3
  const tmpColor = new THREE.Color();
  const m = new THREE.Matrix4();
  const t = new THREE.Matrix4();
  const s = new THREE.Matrix4();
  const muzzleLocal = new THREE.Vector3();
  let n = 0;

  function emit(node, sx, sy, sz, ox, oy, oz, color) {
    if (n >= MAX_PARTS) return;
    t.makeTranslation(ox, oy, oz);
    s.makeScale(sx, sy, sz);
    m.multiplyMatrices(node.matrixWorld, t).multiply(s);
    mesh.setMatrixAt(n, m);
    mesh.setColorAt(n, tmpColor.set(color));
    n++;
  }

  function stateOf(c) {
    let st = states.get(c.id);
    if (!st) {
      st = { phase: Math.random() * 6, deathT: 0, crouchT: 0, outfit: outfitFor(c) };
      states.set(c.id, st);
    }
    return st;
  }

  function pose(c, st, pos, yaw, pitch, dt) {
    root.position.set(pos.x, pos.y, pos.z);
    body.rotation.set(0, yaw, 0);
    const k = Math.min(1, dt * 12);
    st.crouchT += ((c.crouching ? 1 : 0) - st.crouchT) * k;
    const crouch = st.crouchT;
    const hipY = 0.92 - crouch * 0.36;
    hips.position.set(0, hipY, 0);
    upper.position.set(0, 0, 0);
    upper.rotation.set(0, 0, 0);
    head.rotation.set(0, 0, 0);
    gun.rotation.set(0, 0, 0);
    armL.rotation.set(0, 0, 0);
    armR.rotation.set(0, 0, 0);

    if (!c.alive) {
      st.deathT = Math.min(1, st.deathT + dt * 3);
      const e = 1 - (1 - st.deathT) * (1 - st.deathT);
      body.rotation.x = e * (Math.PI / 2) * 0.98;
      legL.rotation.x = 0;
      legR.rotation.x = 0;
      armL.rotation.x = 0.3;
      armR.rotation.x = 0.3;
      return;
    }
    st.deathT = 0;

    const moving = Math.min(c.speed / 4.5, 1.5);
    st.phase += dt * (3 + c.speed * 1.6);
    const swing = Math.sin(st.phase) * 0.65 * moving * (1 - crouch * 0.5);
    if (c.mantle) {
      legL.rotation.x = -1.1;
      legR.rotation.x = -0.4;
    } else if (c.slideTime > 0) {
      legL.rotation.x = -1.35;
      legR.rotation.x = -1.2;
      upper.rotation.x = 0.35;
    } else if (!c.onGround) {
      legL.rotation.x = -0.5;
      legR.rotation.x = 0.3;
    } else {
      legL.rotation.x = swing - crouch * 1.0;
      legR.rotation.x = -swing - crouch * 1.0;
    }
    hips.position.y += c.onGround && !c.mantle ? Math.abs(Math.cos(st.phase)) * 0.04 * moving : 0;

    upper.rotation.x += pitch * 0.35 - crouch * 0.15;
    head.rotation.x = pitch * 0.4;

    if (c.mantle) {
      armL.rotation.x = Math.PI * 0.9;
      armR.rotation.x = Math.PI * 0.9;
    } else if (c.weapon && !c.useItem) {
      const armPitch = Math.PI / 2 + pitch * 0.65;
      armR.rotation.x = armPitch;
      armL.rotation.x = armPitch - 0.15;
      armL.rotation.z = 0.62;
      armR.rotation.z = -0.12;
      gun.rotation.x = pitch * 0.65;
      if (c.sprinting) {
        armR.rotation.x = 0.6;
        armL.rotation.x = 0.8;
        gun.rotation.x = -0.6;
        upper.rotation.x = -0.12;
      }
    } else if (c.useItem) {
      armR.rotation.x = 1.0;
      armL.rotation.x = 1.0;
      armL.rotation.z = 0.4;
      armR.rotation.z = -0.4;
    } else {
      armL.rotation.x = -swing * 0.8;
      armR.rotation.x = swing * 0.8;
    }
  }

  return {
    mesh,
    /** World position of a character's gun muzzle from the last update (or null). */
    muzzleOf(id) {
      return muzzles.get(id) || null;
    },
    forget(id) {
      states.delete(id);
      muzzles.delete(id);
    },
    reset() {
      states.clear();
      muzzles.clear();
    },
    /**
     * characters: iterable; renderPos(c) → {x,y,z}; view(c) → {yaw, pitch} or null for sim values.
     * hideId: character not to draw (first-person-close camera). camPos: for distance culling.
     */
    update(characters, { renderPos, viewOf, hideId = null, camPos, time, dt }) {
      n = 0;
      for (const c of characters) {
        if (!c.alive && c.diedAt != null && time - c.diedAt > CORPSE_TIME) continue;
        const pos = renderPos(c);
        if (camPos && (pos.x - camPos.x) ** 2 + (pos.z - camPos.z) ** 2 > DRAW_DISTANCE * DRAW_DISTANCE) {
          muzzles.delete(c.id);
          continue;
        }
        const st = stateOf(c);
        const v = viewOf(c);
        pose(c, st, pos, v.yaw, v.pitch, dt);
        root.updateMatrixWorld(true);
        const o = st.outfit;

        // Muzzle position (for tracers), even for the hidden local player.
        const w = c.weapon && !c.useItem ? GUNS[c.weapon.type] : null;
        if (w) {
          muzzleLocal.set(0, 0.02, w.muzzle).applyMatrix4(gun.matrixWorld);
          let mz = muzzles.get(c.id);
          if (!mz) muzzles.set(c.id, (mz = new THREE.Vector3()));
          mz.copy(muzzleLocal);
        } else {
          muzzles.delete(c.id);
        }
        if (c.id === hideId) continue;

        for (const [node, sx, sy, sz, ox, oy, oz, key] of BODY_PARTS) {
          const color = key === 'boots' ? '#1d2126' : o[key];
          emit(node, sx, sy, sz, ox, oy, oz, color);
        }
        if (w) {
          const rarity = RARITY[c.weapon.rarity].color;
          for (const [sx, sy, sz, ox, oy, oz, key] of w.parts) emit(gun, sx, sy, sz, ox, oy, oz, key === 'accent' ? rarity : GUN_COLORS[key]);
        } else if (c.useItem) {
          emit(hand, 0.16, 0.16, 0.16, 0, 0, 0, CONSUMABLES[c.useItem.type].color);
        }
      }
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
    },
  };
}

export { GUNS, GUN_COLORS };

// The main-menu stage: your character on a steel turntable, drawn with the game's own renderer
// (so there's no second WebGL context). Shown while no match is loaded.
import * as THREE from 'three';
import { createCrowd } from './crowd.js';

const BG = '#14171b';
const FLOOR = '#262b31';
const STEEL = '#59626c';
const STEEL_DARK = '#3a4047';
const SAFETY = '#ff7a1a';
const RING = '#ffc23a';
const BASE_YAW = Math.PI - 0.42; // facing the camera, turned a little toward the menu
// The character stands this far right of centre (fraction of the width); css --stage-x matches (72%).
export const STAGE_SHIFT = 0.22;

export function createLobby(view) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);
  scene.fog = new THREE.Fog(BG, 7.5, 12.5); // the floor fades out before the backdrop

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60);
  camera.position.set(0, 1.3, 7.4);
  camera.lookAt(0, 0.95, 0);

  // Light: cool fill, a warm key that casts the shadow, and an orange rim from behind.
  scene.add(new THREE.HemisphereLight('#a9bdd6', '#2a2420', 1.0));
  const key = new THREE.DirectionalLight('#fff0d8', 2.3);
  key.position.set(-2.6, 4.2, 3.4);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -2, right: 2, top: 2.6, bottom: -1, near: 0.5, far: 12 });
  key.shadow.bias = -0.0006;
  key.shadow.normalBias = 0.02;
  scene.add(key);
  const rim = new THREE.DirectionalLight(SAFETY, 2.6);
  rim.position.set(2.2, 2.4, -3.2);
  scene.add(rim);

  // Backdrop: a soft orange glow behind the turntable that fades into the dark.
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(22, 13),
    new THREE.MeshBasicMaterial({ map: glowTexture(), transparent: true, depthWrite: false, fog: false }),
  );
  glow.position.set(0, 2.6, -8);
  scene.add(glow);

  // The floor is a pool that fades out at its edge, so there's no horizon line against the backdrop.
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(6, 48),
    new THREE.MeshLambertMaterial({ color: FLOOR, alphaMap: fadeTexture(), transparent: true, depthWrite: false }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // A glowing gold ring on the floor around the turntable.
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(1.36, 1.44, 96),
    new THREE.MeshBasicMaterial({ color: RING, transparent: true, depthWrite: false, fog: false }),
  );
  const halo = new THREE.Mesh(
    new THREE.PlaneGeometry(4, 4),
    new THREE.MeshBasicMaterial({ map: ringGlowTexture(), transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }),
  );
  for (const [i, m] of [halo, ring].entries()) {
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.012;
    m.renderOrder = i + 1; // after the floor pool
    scene.add(m);
  }

  // Turntable: steel disc, a hazard-striped rim and a ring of rivets.
  const table = new THREE.Group();
  const top = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.2, 0.14, 48), new THREE.MeshLambertMaterial({ color: STEEL }));
  top.position.y = 0.07;
  top.receiveShadow = true;
  table.add(top);
  const band = new THREE.Mesh(
    new THREE.CylinderGeometry(1.215, 1.215, 0.07, 64, 1, true),
    new THREE.MeshLambertMaterial({ map: hazardTexture() }),
  );
  band.position.y = 0.055;
  table.add(band);
  const rivetGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.02, 8);
  const rivetMat = new THREE.MeshLambertMaterial({ color: STEEL_DARK });
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const r = new THREE.Mesh(rivetGeo, rivetMat);
    r.position.set(Math.cos(a) * 1.02, 0.145, Math.sin(a) * 1.02);
    table.add(r);
  }
  scene.add(table);

  const crowd = createCrowd(scene, { maxParts: 64 });
  const pos = { x: 0, y: 0.14, z: 0 };
  const look = { yaw: BASE_YAW, pitch: 0 };
  // A stand-in character: just the fields the crowd renderer reads.
  const model = {
    id: 1, kind: 'player', skin: null, alive: true, diedAt: null,
    speed: 0, onGround: true, crouching: false, sprinting: true, slideTime: 0, mantle: null, useItem: null,
    weapon: { type: 'ar', rarity: 'legendary' },
  };
  const renderPos = () => pos;
  const viewOf = () => look;

  let spin = 0; // extra yaw from dragging
  let spinVel = 0;
  let holding = false;
  let idle = 0; // seconds since the last drag
  let time = 0;
  const size = new THREE.Vector2();

  return {
    scene,
    camera,
    setSkin(id) {
      model.skin = id;
    },
    setShadows(on) {
      key.castShadow = on;
    },
    /** Turn the character by a drag of dx pixels (dt: seconds since the last drag event). */
    drag(dx, dt = 1 / 60) {
      holding = true;
      idle = 0;
      spin += dx * 0.012;
      spinVel = (dx * 0.012) / Math.max(dt, 1 / 120);
    },
    release() {
      holding = false;
    },
    update(dt) {
      time += dt;
      // Let go: coast to a stop; a few seconds later, drift back to facing the camera.
      if (holding) spinVel *= Math.exp(-dt * 12); // held still: no fling on release
      else {
        spin += spinVel * dt;
        spinVel *= Math.exp(-dt * 4);
        idle += dt;
        if (idle > 4) spin = wrap(spin) * Math.exp(-dt * 1.2);
      }
      look.yaw = BASE_YAW + spin;
      pos.y = 0.14 + Math.sin(time * 1.7) * 0.006; // breathing
      table.rotation.y = spin * 0.5;
      crowd.update([model], { renderPos, viewOf, camPos: camera.position, time, dt });
    },
    render(renderer) {
      renderer.getSize(size);
      const w = size.x;
      const h = size.y;
      camera.aspect = w / h;
      // Shift the picture so the character stands right of centre, clear of the menu column.
      const shift = w > 900 ? w * STAGE_SHIFT : 0;
      camera.setViewOffset(w, h, -shift, h * 0.05, w, h);
      renderer.render(scene, camera);
    },
  };
}

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(128, 150, 0, 128, 150, 128);
  grad.addColorStop(0, 'rgba(255,122,26,0.32)');
  grad.addColorStop(0.45, 'rgba(255,122,26,0.1)');
  grad.addColorStop(1, 'rgba(255,122,26,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** A soft gold band at the ring's radius (the plane is 4 m across, the ring 1.4 m out). */
function ringGlowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, 'rgba(255,194,58,0)');
  grad.addColorStop(0.56, 'rgba(255,194,58,0)');
  grad.addColorStop(0.7, 'rgba(255,194,58,0.55)');
  grad.addColorStop(0.92, 'rgba(255,194,58,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Opaque in the middle, transparent at the rim (alpha maps read the green channel). */
function fadeTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, '#fff');
  grad.addColorStop(0.35, '#fff');
  grad.addColorStop(1, '#000');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

function hazardTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 32;
  const g = c.getContext('2d');
  g.fillStyle = '#1b1f24';
  g.fillRect(0, 0, 512, 32);
  g.fillStyle = '#f0b21a';
  for (let x = -32; x < 512 + 32; x += 32) {
    g.beginPath();
    g.moveTo(x, 32);
    g.lineTo(x + 16, 32);
    g.lineTo(x + 32, 0);
    g.lineTo(x + 16, 0);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.x = 3;
  return tex;
}

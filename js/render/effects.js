// Visual effects: bullet tracers, muzzle flashes, impact sparks.
import * as THREE from 'three';

const TRACER_SPEED = 480;
const TRACER_LENGTH = 7;
const MAX_PARTICLES = 600;

export function createEffects(scene) {
  // --- Tracers ---
  const tracerGeo = new THREE.BoxGeometry(1, 1, 1);
  const tracerMat = new THREE.MeshBasicMaterial({
    color: '#ffe7a3', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  });
  const tracers = [];
  const tracerPool = [];

  // --- Muzzle flash (one light, toggled, so no shader recompiles) ---
  const flashLight = new THREE.PointLight('#ffc36b', 0, 7, 2);
  scene.add(flashLight);
  const flashMesh = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.16, 0),
    new THREE.MeshBasicMaterial({ color: '#fff1b8', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  flashMesh.visible = false;
  scene.add(flashMesh);
  let flashT = 0;

  // --- Sparks ---
  const pPos = new Float32Array(MAX_PARTICLES * 3);
  const pCol = new Float32Array(MAX_PARTICLES * 3);
  const pVel = new Float32Array(MAX_PARTICLES * 3);
  const pLife = new Float32Array(MAX_PARTICLES);
  for (let i = 0; i < MAX_PARTICLES; i++) pPos[i * 3 + 1] = -1e5;
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  const points = new THREE.Points(
    pGeo,
    new THREE.PointsMaterial({
      size: 0.09, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }),
  );
  points.frustumCulled = false;
  scene.add(points);
  let pNext = 0;
  const tmpColor = new THREE.Color();

  function spawnSparks(p, color, count, speed) {
    tmpColor.set(color);
    for (let n = 0; n < count; n++) {
      const i = pNext;
      pNext = (pNext + 1) % MAX_PARTICLES;
      pPos[i * 3] = p.x;
      pPos[i * 3 + 1] = p.y;
      pPos[i * 3 + 2] = p.z;
      const a = Math.random() * Math.PI * 2;
      const u = Math.random() * 2 - 1;
      const s = Math.sqrt(1 - u * u);
      const v = speed * (0.4 + Math.random() * 0.8);
      pVel[i * 3] = Math.cos(a) * s * v;
      pVel[i * 3 + 1] = Math.abs(u) * v + 1.5;
      pVel[i * 3 + 2] = Math.sin(a) * s * v;
      pLife[i] = 0.25 + Math.random() * 0.25;
      pCol[i * 3] = tmpColor.r;
      pCol[i * 3 + 1] = tmpColor.g;
      pCol[i * 3 + 2] = tmpColor.b;
    }
  }

  const _from = new THREE.Vector3();
  const _to = new THREE.Vector3();

  // --- Explosions & projectiles ---
  const blastGeo = new THREE.IcosahedronGeometry(1, 1);
  const blasts = [];
  const rocketGeo = new THREE.CylinderGeometry(0.07, 0.09, 0.6, 6).rotateX(Math.PI / 2);
  const rocketMat = new THREE.MeshLambertMaterial({ color: '#5b6b3a', emissive: '#ff7a1a', emissiveIntensity: 0.4 });
  const bulletGeo = new THREE.BoxGeometry(0.05, 0.05, 1.6);
  const bulletMat = new THREE.MeshBasicMaterial({ color: '#fff2b0', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const projViews = new Map();
  let smokeTimer = 0;

  return {
    /** from: muzzle position in world space (Vector3-like), to: hit/end point. */
    tracer(from, to) {
      _from.set(from.x, from.y, from.z);
      _to.set(to.x, to.y, to.z);
      const length = _from.distanceTo(_to);
      if (length < 0.5) return;
      const mesh = tracerPool.pop() || new THREE.Mesh(tracerGeo, tracerMat);
      mesh.visible = true;
      scene.add(mesh);
      tracers.push({ mesh, from: _from.clone(), dir: _to.clone().sub(_from).normalize(), length, d: 0 });
    },
    muzzleFlash(pos) {
      flashT = 0.05;
      flashLight.position.set(pos.x, pos.y, pos.z);
      flashLight.intensity = 6;
      flashMesh.position.set(pos.x, pos.y, pos.z);
      flashMesh.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      flashMesh.scale.setScalar(0.7 + Math.random() * 0.6);
      flashMesh.visible = true;
    },
    impact(point, kind) {
      if (kind === 'shield') spawnSparks(point, '#6cc6ff', 10, 4);
      else if (kind === 'flesh') spawnSparks(point, '#ff5a46', 8, 3);
      else spawnSparks(point, '#ffd27a', 7, 3.5);
    },
    explosion(point, radius) {
      const mat = new THREE.MeshBasicMaterial({ color: '#ffb347', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
      const mesh = new THREE.Mesh(blastGeo, mat);
      mesh.position.set(point.x, point.y, point.z);
      scene.add(mesh);
      blasts.push({ mesh, t: 0, radius });
      spawnSparks(point, '#ffcf6b', 40, 9);
      spawnSparks(point, '#ff6a2a', 25, 6);
      spawnSparks(point, '#55504a', 30, 3);
      flashT = 0.12;
      flashLight.position.set(point.x, point.y + 1, point.z);
      flashLight.intensity = 60;
    },
    /** Draw rockets and sniper rounds from the simulation's projectile list. */
    syncProjectiles(list, dt) {
      const seen = new Set();
      for (const p of list) {
        seen.add(p.id);
        let v = projViews.get(p.id);
        if (!v) {
          const rocket = p.weapon === 'rocket';
          v = new THREE.Mesh(rocket ? rocketGeo : bulletGeo, rocket ? rocketMat : bulletMat);
          scene.add(v);
          projViews.set(p.id, v);
        }
        v.position.set(p.pos.x, p.pos.y, p.pos.z);
        _to.set(p.pos.x + p.vel.x, p.pos.y + p.vel.y, p.pos.z + p.vel.z);
        v.lookAt(_to);
        if (p.weapon === 'rocket') {
          smokeTimer -= dt;
          if (smokeTimer <= 0) {
            smokeTimer = 0.02;
            spawnSparks(p.pos, '#8a8580', 2, 0.8);
            spawnSparks(p.pos, '#ff9a3a', 1, 0.5);
          }
        }
      }
      for (const [id, v] of projViews) {
        if (seen.has(id)) continue;
        scene.remove(v);
        projViews.delete(id);
      }
    },
    update(dt) {
      for (let i = blasts.length - 1; i >= 0; i--) {
        const b = blasts[i];
        b.t += dt;
        const k = b.t / 0.45;
        if (k >= 1) {
          scene.remove(b.mesh);
          b.mesh.material.dispose();
          blasts.splice(i, 1);
          continue;
        }
        b.mesh.scale.setScalar(0.3 + b.radius * 0.9 * Math.sqrt(k));
        b.mesh.material.opacity = 0.9 * (1 - k);
      }
      for (let i = tracers.length - 1; i >= 0; i--) {
        const t = tracers[i];
        t.d += TRACER_SPEED * dt;
        const head = Math.min(t.d, t.length);
        const tail = Math.max(0, t.d - TRACER_LENGTH);
        if (tail >= t.length) {
          scene.remove(t.mesh);
          tracerPool.push(t.mesh);
          tracers.splice(i, 1);
          continue;
        }
        const mid = (head + tail) / 2;
        t.mesh.position.copy(t.from).addScaledVector(t.dir, mid);
        t.mesh.lookAt(_to.copy(t.from).addScaledVector(t.dir, head + 0.01));
        t.mesh.scale.set(0.03, 0.03, Math.max(0.01, head - tail));
      }

      if (flashT > 0) {
        flashT -= dt;
        if (flashT <= 0) {
          flashLight.intensity = 0;
          flashMesh.visible = false;
        }
      }

      let any = false;
      for (let i = 0; i < MAX_PARTICLES; i++) {
        if (pLife[i] <= 0) continue;
        any = true;
        pLife[i] -= dt;
        if (pLife[i] <= 0) {
          pPos[i * 3 + 1] = -1e5;
          continue;
        }
        pVel[i * 3 + 1] -= 14 * dt;
        pPos[i * 3] += pVel[i * 3] * dt;
        pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt;
        pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt;
      }
      if (any) pGeo.attributes.position.needsUpdate = true;
      pGeo.attributes.color.needsUpdate = true;
    },
  };
}

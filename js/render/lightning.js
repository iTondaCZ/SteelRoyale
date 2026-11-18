// Lightning bolts: each strike is a branching channel (bolt-paths.js) drawn as camera-facing ribbons
// with a white-hot core and a violet halo. A strike draws itself down from the cloud in a few frames,
// then flickers through a few return strokes and fades. A small pool of strikes is reused.
import * as THREE from 'three';
import { boltPaths, MAX_BOLT_POINTS, MAX_BOLT_SEGMENTS } from './bolt-paths.js';

export const MAX_STRIKES = 3;
const CORE = 0.55; // metres, half-width of the main channel's bright core
const HALO = 6; // the ribbon is this many core half-widths wide on each side
const LEADER = 0.07; // seconds for the channel to reach the ground

const BOLT_VERT = /* glsl */ `
  attribute vec3 aDir;
  attribute float aSide;
  attribute float aWidth;
  attribute float aBright;
  attribute float aAlong;
  uniform float uPixel; // world size of one screen pixel at 1 m
  varying float vAcross;
  varying float vBright;
  varying float vAlong;
  void main() {
    vec3 toCam = cameraPosition - position;
    float d = length(toCam);
    vec3 side = cross(aDir, toCam / d);
    float l = length(side);
    side = l > 1e-4 ? side / l : vec3(1.0, 0.0, 0.0);
    // Never thinner than about a pixel, so distant bolts don't break up into dashes.
    float core = max(aWidth, d * uPixel * 0.7);
    vec3 world = position + side * aSide * core * ${HALO.toFixed(1)};
    vAcross = aSide;
    vBright = aBright;
    vAlong = aAlong;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
    // Same trick as the storm wall: strikes in the wall can be past the far plane.
    gl_Position.z = min(gl_Position.z, gl_Position.w * 0.99999);
  }
`;

const BOLT_FRAG = /* glsl */ `
  uniform float uIntensity;
  uniform float uGrow;
  varying float vAcross;
  varying float vBright;
  varying float vAlong;
  void main() {
    if (vAlong > uGrow) discard;
    float a = abs(vAcross);
    float core = 1.0 - smoothstep(${(0.6 / HALO).toFixed(3)}, ${(1.4 / HALO).toFixed(3)}, a);
    float halo = exp(-a * a * 5.0) * (1.0 - a);
    // The tip of the channel that's still growing burns brightest.
    float tip = 1.0 + 2.0 * smoothstep(uGrow - 0.06, uGrow, vAlong) * step(uGrow, 0.999);
    // Fade in out of the cloud at the top.
    float b = vBright * smoothstep(0.0, 0.1, vAlong) * uIntensity * tip;
    vec3 col = vec3(1.0, 0.97, 1.0) * core + vec3(0.55, 0.38, 1.0) * halo * 0.75;
    gl_FragColor = vec4(col * b, 1.0);
  }
`;

/**
 * Flicker: a dim leader while the channel grows, then 2–4 return strokes a few frames apart,
 * each flaring and decaying fast.
 */
function makeStrokes(rng) {
  const n = 2 + Math.floor(rng() * 3);
  const strokes = [{ t: LEADER, peak: 1 }];
  let t = LEADER;
  for (let i = 1; i < n; i++) {
    t += 0.05 + rng() * 0.11;
    strokes.push({ t, peak: 0.45 + rng() * 0.45 });
  }
  return strokes;
}

function intensityAt(strokes, age) {
  if (age < LEADER) return 0.4;
  let v = 0;
  for (const s of strokes) if (age >= s.t) v = Math.max(v, s.peak * Math.exp(-(age - s.t) * 13));
  return v;
}

export function createLightning(scene) {
  const pixel = { value: 0.002 };
  const strikes = [];
  for (let i = 0; i < MAX_STRIKES; i++) {
    const maxV = MAX_BOLT_POINTS * 2;
    const geo = new THREE.BufferGeometry();
    const attr = (size) => new THREE.BufferAttribute(new Float32Array(maxV * size), size).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', attr(3));
    geo.setAttribute('aDir', attr(3));
    geo.setAttribute('aSide', attr(1));
    geo.setAttribute('aWidth', attr(1));
    geo.setAttribute('aBright', attr(1));
    geo.setAttribute('aAlong', attr(1));
    geo.setIndex(new THREE.BufferAttribute(new Uint16Array(MAX_BOLT_SEGMENTS * 6), 1).setUsage(THREE.DynamicDrawUsage));
    const uniforms = { uPixel: pixel, uIntensity: { value: 0 }, uGrow: { value: 0 } };
    const mesh = new THREE.Mesh(
      geo,
      new THREE.ShaderMaterial({
        uniforms,
        vertexShader: BOLT_VERT,
        fragmentShader: BOLT_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    );
    mesh.frustumCulled = false;
    mesh.renderOrder = 4;
    mesh.visible = false;
    scene.add(mesh);
    strikes.push({
      mesh,
      geo,
      uniforms,
      active: false,
      age: 0,
      life: 0,
      strokes: [],
      intensity: 0,
      kind: '',
      top: new THREE.Vector3(),
      ground: new THREE.Vector3(),
      glow: new THREE.Vector3(), // centre of the light it casts on the clouds
    });
  }

  /** Write the ribbons for `paths` into the strike's buffers. */
  function build(strike, paths, topY, groundY) {
    const g = strike.geo;
    const pos = g.attributes.position.array;
    const dir = g.attributes.aDir.array;
    const side = g.attributes.aSide.array;
    const width = g.attributes.aWidth.array;
    const bright = g.attributes.aBright.array;
    const along = g.attributes.aAlong.array;
    const index = g.index.array;
    let v = 0;
    let k = 0;
    const span = Math.max(1, topY - groundY);
    for (const path of paths) {
      const pts = path.points;
      const first = v;
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        const a = pts[Math.max(0, i - 1)];
        const b = pts[Math.min(pts.length - 1, i + 1)];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let dz = b.z - a.z;
        const len = Math.hypot(dx, dy, dz) || 1;
        dx /= len;
        dy /= len;
        dz /= len;
        const t = i / (pts.length - 1);
        const w = CORE * path.width * (path.taper ? 1 - 0.65 * t : 1);
        const br = path.bright * (path.taper ? 1 - 0.75 * t : 1);
        const al = Math.min(1, Math.max(0, (topY - p.y) / span));
        for (const s of [-1, 1]) {
          pos[v * 3] = p.x;
          pos[v * 3 + 1] = p.y;
          pos[v * 3 + 2] = p.z;
          dir[v * 3] = dx;
          dir[v * 3 + 1] = dy;
          dir[v * 3 + 2] = dz;
          side[v] = s;
          width[v] = w;
          bright[v] = br;
          along[v] = al;
          v++;
        }
      }
      for (let i = 0; i < pts.length - 1; i++) {
        const a = first + i * 2;
        index[k++] = a;
        index[k++] = a + 1;
        index[k++] = a + 2;
        index[k++] = a + 1;
        index[k++] = a + 3;
        index[k++] = a + 2;
      }
    }
    for (const name of ['position', 'aDir', 'aSide', 'aWidth', 'aBright', 'aAlong']) {
      g.attributes[name].clearUpdateRanges();
      g.attributes[name].addUpdateRange(0, v * g.attributes[name].itemSize);
      g.attributes[name].needsUpdate = true;
    }
    g.index.clearUpdateRanges();
    g.index.addUpdateRange(0, k);
    g.index.needsUpdate = true;
    g.setDrawRange(0, k);
  }

  return {
    strikes,

    /** Start a strike from `top` (in the cloud) to `ground`. Returns false if every slot is busy. */
    spawn(top, ground, kind, rng = Math.random) {
      const strike = strikes.find((s) => !s.active);
      if (!strike) return false;
      build(strike, boltPaths(rng, top, ground), top.y, ground.y);
      strike.active = true;
      strike.kind = kind;
      strike.age = 0;
      strike.strokes = makeStrokes(rng);
      strike.life = strike.strokes[strike.strokes.length - 1].t + 0.35;
      strike.top.set(top.x, top.y, top.z);
      strike.ground.set(ground.x, ground.y, ground.z);
      strike.glow.set((top.x + ground.x) / 2, top.y * 0.65 + ground.y * 0.35, (top.z + ground.z) / 2);
      strike.mesh.visible = true;
      return true;
    },

    /** Advance every strike. camera/heightPx: to keep distant bolts at least a pixel wide. */
    update(dt, camera, heightPx) {
      pixel.value = (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) / Math.max(1, heightPx);
      for (const s of strikes) {
        if (!s.active) continue;
        s.age += dt;
        if (s.age >= s.life) {
          s.active = false;
          s.intensity = 0;
          s.mesh.visible = false;
          continue;
        }
        s.intensity = intensityAt(s.strokes, s.age);
        s.uniforms.uIntensity.value = s.intensity;
        s.uniforms.uGrow.value = Math.min(1, s.age / LEADER);
      }
    },
  };
}

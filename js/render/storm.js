// The storm: an animated wall on the edge of the safe circle, and the weather you're in when you're
// outside it (purple haze, rain, lightning). Everything here is cosmetic; the damage lives in sim/zone.js.
import * as THREE from 'three';
import { createLightning, MAX_STRIKES } from './lightning.js';

const HEIGHT = 260;
const BOTTOM = -30;

// The patterns come from one small tiling noise texture made at load time (texture reads are far
// cheaper than computing noise per pixel, and mipmaps stop fine detail shimmering in the distance):
//   r, g: fractal value noise (two different seeds), b: single-octave fine noise for rain streaks.
const NOISE_SIZE = 256;

function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeNoiseTexture() {
  const N = NOISE_SIZE;
  const rng = mulberry32(90210);
  // Tiling value noise with n lattice cells across the texture.
  const layer = (n) => {
    const grid = Float32Array.from({ length: n * n }, rng);
    const out = new Float32Array(N * N);
    for (let y = 0; y < N; y++) {
      const fy = (y / N) * n;
      const iy = Math.floor(fy);
      let ty = fy - iy;
      ty = ty * ty * (3 - 2 * ty);
      const y0 = iy % n;
      const y1 = (iy + 1) % n;
      for (let x = 0; x < N; x++) {
        const fx = (x / N) * n;
        const ix = Math.floor(fx);
        let tx = fx - ix;
        tx = tx * tx * (3 - 2 * tx);
        const x0 = ix % n;
        const x1 = (ix + 1) % n;
        const a = grid[y0 * n + x0] + (grid[y0 * n + x1] - grid[y0 * n + x0]) * tx;
        const b = grid[y1 * n + x0] + (grid[y1 * n + x1] - grid[y1 * n + x0]) * tx;
        out[y * N + x] = a + (b - a) * ty;
      }
    }
    return out;
  };
  const fbm = () => {
    const sum = new Float32Array(N * N);
    let amp = 0.5;
    for (const n of [4, 8, 16, 32]) {
      const l = layer(n);
      for (let i = 0; i < sum.length; i++) sum[i] += l[i] * amp;
      amp *= 0.5;
    }
    return sum;
  };
  const stretch = (a) => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const v of a) {
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
    return a.map((v) => (v - lo) / (hi - lo));
  };
  const channels = [stretch(fbm()), stretch(fbm()), layer(32)];
  const data = new Uint8Array(N * N * 4);
  for (let i = 0; i < N * N; i++) {
    for (let c = 0; c < 3; c++) data[i * 4 + c] = Math.round(channels[c][i] * 255);
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

const NOISE = /* glsl */ `
  uniform sampler2D uNoise;
`;

const WALL_VERT = /* glsl */ `
  varying vec3 vWorld;
  varying vec3 vNormal;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vNormal = vec3(position.x, 0.0, position.z);
    gl_Position = projectionMatrix * viewMatrix * world;
    // The wall is often farther away than the camera's far plane (fog far + 40 m), which would cut an
    // elliptical hole in it straight ahead. Pin vertices past the far plane onto it instead of clipping
    // them, so the wall stays whole at any distance without drawing the terrain farther out. Vertices
    // behind the camera have w < 0 and z < w, so they're untouched and near clipping still works.
    gl_Position.z = min(gl_Position.z, gl_Position.w * 0.99999);
  }
`;

const WALL_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uFlash;
  uniform bool uOutside;
  uniform vec4 uStrikes[${MAX_STRIKES}]; // xyz: glow centre, w: brightness
  varying vec3 vWorld;
  varying vec3 vNormal;
  ${NOISE}
  // World-space texture lookup on a vertical surface: blend a projection along x and one along z by
  // the normal (sharpened), so there's no seam anywhere around the circle.
  vec2 wB;
  vec4 wallTex(vec2 scale, vec2 scroll) {
    vec4 a = texture2D(uNoise, vec2(vWorld.z, vWorld.y) / scale + scroll);
    vec4 b = texture2D(uNoise, vec2(vWorld.x, vWorld.y) / scale + scroll);
    return a * wB.x + b * wB.y;
  }
  void main() {
    // Only the side of the wall facing you: from outside the circle that's the outer (front) faces,
    // which skips drawing the far side of the circle a second time behind the near side.
    if (gl_FrontFacing != uOutside) discard;
    vec3 p = vWorld;
    float t = uTime;
    vec3 toCam = cameraPosition - p;
    float dist = length(toCam);
    vec3 n = normalize(vNormal);
    wB = n.xz * n.xz;
    wB *= wB;
    wB /= wB.x + wB.y;

    // Rolling clouds: two noise layers drifting different ways, so they change shape as they go.
    float clouds = wallTex(vec2(150.0, 100.0), vec2(t * 0.012, t * 0.009)).r * 0.6
                 + wallTex(vec2(90.0, 60.0), vec2(-t * 0.017, t * 0.004)).g * 0.4;

    // Rain sheets: thin vertical streaks falling down the wall. Mipmapping blurs them away with distance.
    float streak = wallTex(vec2(19.0, 350.0), vec2(0.0, t * 0.08)).b;
    streak = smoothstep(0.72, 0.96, streak) * (1.0 - smoothstep(40.0, 160.0, dist));

    // Light from lightning bolts (lightning.js): a soft glow around each one, stretched along the bolt.
    float lit = 0.0;
    for (int i = 0; i < ${MAX_STRIKES}; i++) {
      vec3 d = p - uStrikes[i].xyz;
      d.y *= 0.45;
      lit += uStrikes[i].w * exp(-dot(d, d) / 3800.0);
    }
    vec3 boltLight = vec3(0.72, 0.66, 1.0);

    // Dense and glowing at the ground, thinning out and fading to nothing at the top.
    float h = p.y;
    float top = 1.0 - smoothstep(50.0, ${(HEIGHT + BOTTOM - 10).toFixed(1)}, h);
    float ground = exp(-max(h, 0.0) / 16.0);

    // Looking along the wall (grazing angle) you look through more of it.
    float facing = abs(dot(n, toCam / dist));
    float graze = 1.0 - facing;

    float billow = smoothstep(0.25, 0.85, clouds);
    float alpha = ((0.22 + 0.5 * billow) * top + 0.3 * ground) * (1.0 + 0.7 * graze * graze);
    // Up close (walking through it) it thins out, so you can still see where you're going.
    alpha *= mix(0.3, 1.0, smoothstep(2.0, 30.0, dist));
    alpha = clamp(alpha, 0.0, 0.88);

    vec3 deep = vec3(0.16, 0.04, 0.30);
    vec3 mid = vec3(0.50, 0.18, 0.78);
    vec3 hot = vec3(0.95, 0.62, 1.0);
    vec3 body = mix(deep, mid, billow * 0.8 + 0.35 * ground);
    vec3 glow = mid * (0.55 * ground * top + 0.3 * billow * billow * billow)
              + hot * (0.18 * streak * top + 0.3 * uFlash * billow)
              + boltLight * lit * (0.3 + 1.1 * billow);

    // Premultiplied alpha: darken what's behind by alpha, then add the storm's own light.
    gl_FragColor = vec4(body * alpha + glow * min(1.0, alpha * 2.5), alpha);
  }
`;

// Rain around the camera while you're in the storm: streaks that live in world space and wrap
// around a box centred on the camera, all moved in the vertex shader (no per-frame CPU work).
const RAIN_VERT = /* glsl */ `
  attribute float aTail;
  uniform vec3 uCam;
  uniform vec3 uBox;
  uniform float uTime;
  varying float vAlpha;
  void main() {
    vec3 vel = vec3(7.0, -34.0, 4.0);
    vec3 p = position * uBox + vel * uTime;
    p = mod(p - uCam + uBox * 0.5, uBox) - uBox * 0.5;
    vec3 world = uCam + p - vel * (0.05 * aTail);
    float r = length(p.xz) / (uBox.x * 0.5);
    float edge = (1.0 - smoothstep(0.55, 1.0, r)) * (1.0 - smoothstep(0.6, 1.0, abs(p.y) / (uBox.y * 0.5)));
    vAlpha = edge * (1.0 - aTail);
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const RAIN_FRAG = /* glsl */ `
  uniform float uAmount;
  uniform float uFlash;
  varying float vAlpha;
  void main() {
    vec3 c = mix(vec3(0.55, 0.38, 0.8), vec3(1.0, 0.92, 1.0), uFlash);
    gl_FragColor = vec4(c * vAlpha * uAmount * 0.55, 1.0);
  }
`;

// Low storm clouds racing overhead while you're in it: a dome around the camera, noise projected
// onto a flat cloud layer so the clouds bunch up toward the horizon.
const CLOUD_RADIUS = 380;
const CLOUD_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const CLOUD_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uAmount;
  uniform float uFlash;
  uniform vec4 uStrikeTops[${MAX_STRIKES}]; // xyz: where the bolt leaves the cloud, w: brightness
  varying vec3 vDir;
  ${NOISE}
  void main() {
    vec3 d = normalize(vDir);
    float up = d.y + 0.12;
    if (up <= 0.0) discard;
    vec2 uv = d.xz / up * 0.4;
    float n = texture2D(uNoise, uv + vec2(uTime * 0.018, uTime * 0.008)).r * 0.65
            + texture2D(uNoise, uv * 2.7 + vec2(uTime * 0.03, -uTime * 0.012)).g * 0.35;
    float cover = smoothstep(0.3, 0.75, n);
    float alpha = (0.45 + 0.5 * cover) * smoothstep(0.0, 0.3, up) * uAmount;
    vec3 col = mix(vec3(0.07, 0.03, 0.13), vec3(0.3, 0.17, 0.42), cover * cover);
    // Clouds light up from inside around each bolt, plus a little everywhere.
    float lit = 0.0;
    for (int i = 0; i < ${MAX_STRIKES}; i++) {
      if (uStrikeTops[i].w <= 0.0) continue;
      vec3 toBolt = normalize(uStrikeTops[i].xyz - cameraPosition);
      lit += uStrikeTops[i].w * exp((dot(d, toBolt) - 1.0) * 22.0);
    }
    col += vec3(0.85, 0.7, 1.0) * (lit * (0.35 + 1.2 * cover) + uFlash * 0.15 * cover);
    gl_FragColor = vec4(col * alpha, alpha);
  }
`;

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * view = createRenderer(...) result: the storm also drives the scene's weather through view.setWeather.
 * groundAt(x, z): ground (or water) height, where lightning strikes.
 */
export function createStormView(view, { groundAt = () => 0 } = {}) {
  const { scene } = view;
  const noise = { value: makeNoiseTexture() };

  // ---------- Wall ----------
  const geo = new THREE.CylinderGeometry(1, 1, HEIGHT, 128, 1, true);
  geo.translate(0, HEIGHT / 2 + BOTTOM, 0);
  const strikeVecs = () => Array.from({ length: MAX_STRIKES }, () => new THREE.Vector4());
  const wallUniforms = {
    uNoise: noise,
    uTime: { value: 0 },
    uFlash: { value: 0 },
    uOutside: { value: false },
    uStrikes: { value: strikeVecs() },
  };
  const wallMat = new THREE.ShaderMaterial({
    uniforms: wallUniforms,
    vertexShader: WALL_VERT,
    fragmentShader: WALL_FRAG,
    transparent: true,
    premultipliedAlpha: true, // NormalBlending → ONE, ONE_MINUS_SRC_ALPHA
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const wall = new THREE.Mesh(geo, wallMat);
  wall.frustumCulled = false;
  wall.renderOrder = 2;
  scene.add(wall);

  // ---------- Rain ----------
  const DROPS = 900;
  const seeds = new Float32Array(DROPS * 6);
  const tails = new Float32Array(DROPS * 2);
  for (let i = 0; i < DROPS; i++) {
    const s = [Math.random(), Math.random(), Math.random()];
    seeds.set(s, i * 6);
    seeds.set(s, i * 6 + 3);
    tails[i * 2 + 1] = 1;
  }
  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute('position', new THREE.BufferAttribute(seeds, 3));
  rainGeo.setAttribute('aTail', new THREE.BufferAttribute(tails, 1));
  const rainUniforms = {
    uCam: { value: new THREE.Vector3() },
    uBox: { value: new THREE.Vector3(60, 34, 60) },
    uTime: { value: 0 },
    uAmount: { value: 0 },
    uFlash: { value: 0 },
  };
  const rain = new THREE.LineSegments(
    rainGeo,
    new THREE.ShaderMaterial({
      uniforms: rainUniforms,
      vertexShader: RAIN_VERT,
      fragmentShader: RAIN_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  rain.frustumCulled = false;
  rain.renderOrder = 3;
  rain.visible = false;
  scene.add(rain);

  // ---------- Clouds ----------
  const cloudUniforms = {
    uNoise: noise,
    uTime: { value: 0 },
    uAmount: { value: 0 },
    uFlash: { value: 0 },
    uStrikeTops: { value: strikeVecs() },
  };
  const clouds = new THREE.Mesh(
    new THREE.SphereGeometry(CLOUD_RADIUS, 32, 12, 0, Math.PI * 2, 0, Math.PI * 0.6),
    new THREE.ShaderMaterial({
      uniforms: cloudUniforms,
      vertexShader: CLOUD_VERT,
      fragmentShader: CLOUD_FRAG,
      transparent: true,
      premultipliedAlpha: true,
      depthWrite: false,
      side: THREE.BackSide,
    }),
  );
  clouds.frustumCulled = false;
  clouds.renderOrder = 1;
  clouds.visible = false;
  scene.add(clouds);

  // ---------- Lightning ----------
  // Two kinds of strike: inside the wall (seen from anywhere, placed where you're looking) and,
  // while you're in the storm, cloud-to-ground strikes around you.
  const lightning = createLightning(scene);
  const rng = Math.random;
  let wallTimer = 1 + rng() * 2;
  let fieldTimer = 1.5;
  const look = new THREE.Vector3();

  function forwardXZ() {
    view.camera.getWorldDirection(look);
    const l = Math.hypot(look.x, look.z) || 1;
    return { x: look.x / l, z: look.z / l };
  }

  function strikeInWall(zone, camPos) {
    const { x, z, r } = zone.current;
    const f = forwardXZ();
    for (let tries = 0; tries < 12; tries++) {
      const a = rng() * Math.PI * 2;
      const gx = x + Math.cos(a) * r;
      const gz = z + Math.sin(a) * r;
      const dx = gx - camPos.x;
      const dz = gz - camPos.z;
      const d = Math.hypot(dx, dz);
      if (d < 30 || d > 1100 || (dx * f.x + dz * f.z) / d < 0.6) continue; // in view, within ±53°
      // Leave the cloud a little to one side along the wall, so the bolt leans.
      const lean = (rng() * 2 - 1) * 35;
      const gy = groundAt(gx, gz);
      const top = { x: gx - Math.sin(a) * lean, y: gy + 150 + rng() * 60, z: gz + Math.cos(a) * lean };
      lightning.spawn(top, { x: gx, y: gy, z: gz }, 'wall', rng);
      return;
    }
  }

  function strikeNearby(zone, camPos) {
    const f = forwardXZ();
    // Mostly somewhere in front of you, so you see it.
    const a = Math.atan2(f.z, f.x) + (rng() < 0.7 ? (rng() * 2 - 1) * 0.9 : rng() * Math.PI * 2);
    const d = 70 + rng() * 190;
    const gx = camPos.x + Math.cos(a) * d;
    const gz = camPos.z + Math.sin(a) * d;
    const c = zone.current;
    if (c.r >= 0.5 && Math.hypot(gx - c.x, gz - c.z) < c.r + 10) return; // only out in the storm
    const gy = groundAt(gx, gz);
    const ta = rng() * Math.PI * 2;
    const off = rng() * 45;
    const top = { x: gx + Math.cos(ta) * off, y: gy + 200 + rng() * 70, z: gz + Math.sin(ta) * off };
    lightning.spawn(top, { x: gx, y: gy, z: gz }, 'field', rng);
  }

  return {
    lightning, // for poking at from the console: steel.session.storm.lightning.spawn(top, ground, 'field')
    /**
     * zone: game.zone; time: seconds; camPos: camera position; dt: frame seconds.
     * Returns how deep the camera is in the storm (0 = safe, 1 = in it).
     */
    update(zone, time, camPos, dt = 0) {
      if (!zone || !camPos) {
        wall.visible = false;
        rain.visible = false;
        clouds.visible = false;
        view.setWeather(0, 0);
        return 0;
      }
      const { x, z, r } = zone.current;
      // Once the last circle has closed there's no wall left, only storm.
      wall.visible = r >= 0.5;
      wall.position.set(x, 0, z);
      wall.scale.set(Math.max(r, 0.5), 1, Math.max(r, 0.5));

      // How far outside the circle the camera is, eased over a few metres around the wall.
      const out = Math.hypot(camPos.x - x, camPos.z - z) - r;
      const amount = wall.visible ? smoothstep(-4, 14, out) : 1;

      if (wall.visible) {
        wallTimer -= dt;
        if (wallTimer <= 0) {
          strikeInWall(zone, camPos);
          wallTimer = 1.5 + rng() * 3;
        }
      }
      if (amount > 0.4) {
        fieldTimer -= dt;
        if (fieldTimer <= 0) {
          strikeNearby(zone, camPos);
          fieldTimer = 2 + rng() * 4;
        }
      }
      lightning.update(dt, view.camera, view.renderer.domElement.height);

      // A strike lights up everything around it: fully for one out in the storm with you, a little
      // for one in the wall, less the farther away it is.
      let f = 0;
      lightning.strikes.forEach((s, i) => {
        const w = s.active ? s.intensity : 0;
        wallUniforms.uStrikes.value[i].set(s.glow.x, s.glow.y, s.glow.z, w);
        cloudUniforms.uStrikeTops.value[i].set(s.top.x, s.top.y, s.top.z, w);
        if (!w) return;
        const near = 1 - smoothstep(80, 500, Math.hypot(s.ground.x - camPos.x, s.ground.z - camPos.z));
        f = Math.max(f, w * (s.kind === 'field' ? 0.5 + 0.5 * near : 0.35 * near));
      });

      wallUniforms.uTime.value = time;
      wallUniforms.uFlash.value = f * amount;
      wallUniforms.uOutside.value = out > 0;
      rain.visible = amount > 0.01;
      if (rain.visible) {
        rainUniforms.uCam.value.copy(camPos);
        rainUniforms.uTime.value = time;
        rainUniforms.uAmount.value = amount;
        rainUniforms.uFlash.value = f;
      }
      clouds.visible = amount > 0.01;
      if (clouds.visible) {
        clouds.position.copy(camPos);
        cloudUniforms.uTime.value = time;
        cloudUniforms.uAmount.value = amount;
        cloudUniforms.uFlash.value = f;
      }
      view.setWeather(amount, f);
      return amount;
    },
  };
}

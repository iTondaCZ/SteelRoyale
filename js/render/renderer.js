// Three.js renderer, scene, lights, sky and fog.
import * as THREE from 'three';

export const SKY_TOP = '#4c7fbf';
export const SKY_HORIZON = '#cddbe6';
// Everything past the fog is invisible, so the camera stops drawing just beyond it.
const FOG_FAR = 440;
const SKY_RADIUS = FOG_FAR;
// Integrated graphics: rendering at 1.5x instead of 2x on high-DPI screens saves a lot of fill rate.
const MAX_PIXEL_RATIO = 1.5;

// Weather inside the storm (see setWeather). The sky is multiplied by STORM_SKY_TINT and the fog
// takes the tinted horizon colour, so the haze and the sky still meet without a seam.
const CLEAR = { fogNear: 130, fogFar: FOG_FAR, hemi: 1.35, sun: 2.4 };
const STORM = { fogNear: 4, fogFar: 150, hemi: 0.8, sun: 0.35 };
const STORM_SKY_TINT = '#6e3d9a';
const FLASH_COLOR = '#efe0ff';
const HEMI_SKY = '#d6e6ff';
const HEMI_GROUND = '#6b5d48';
const STORM_HEMI_SKY = '#c4a2ff';
const STORM_HEMI_GROUND = '#3c2c52';

export function createRenderer(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY_HORIZON);
  scene.fog = new THREE.Fog(SKY_HORIZON, 130, FOG_FAR);

  const camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, FOG_FAR + 40);
  camera.rotation.order = 'YXZ';

  const hemi = new THREE.HemisphereLight(HEMI_SKY, HEMI_GROUND, CLEAR.hemi);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight('#fff0d8', CLEAR.sun);
  const sunOffset = new THREE.Vector3(60, 110, 40);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -55;
  sc.right = 55;
  sc.top = 55;
  sc.bottom = -55;
  sc.near = 10;
  sc.far = 320;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  scene.add(sun);
  scene.add(sun.target);

  const sky = createSkyDome();
  scene.add(sky);

  const horizon = new THREE.Color(SKY_HORIZON);
  const white = new THREE.Color(1, 1, 1);
  const skyTint = new THREE.Color(STORM_SKY_TINT);
  const flashColor = new THREE.Color(FLASH_COLOR);
  const hemiSky = [new THREE.Color(HEMI_SKY), new THREE.Color(STORM_HEMI_SKY)];
  const hemiGround = [new THREE.Color(HEMI_GROUND), new THREE.Color(STORM_HEMI_GROUND)];
  const lerp = (a, b, k) => a + (b - a) * k;
  let weatherKey = '0|0';

  /** storm: 0 = clear day, 1 = deep in the storm. flash: 0..1 lightning. */
  function setWeather(storm, flash = 0) {
    const k = Math.min(1, Math.max(0, storm));
    const key = `${k.toFixed(3)}|${flash.toFixed(3)}`;
    if (key === weatherKey) return;
    weatherKey = key;
    sky.material.color.copy(white).lerp(skyTint, k).lerp(flashColor, flash * 0.45);
    scene.fog.color.copy(horizon).multiply(sky.material.color);
    scene.background.copy(scene.fog.color);
    scene.fog.near = lerp(CLEAR.fogNear, STORM.fogNear, k);
    scene.fog.far = lerp(CLEAR.fogFar, STORM.fogFar, k) + flash * 60;
    hemi.intensity = lerp(CLEAR.hemi, STORM.hemi, k) + flash * 1.6;
    hemi.color.copy(hemiSky[0]).lerp(hemiSky[1], k).lerp(flashColor, flash);
    hemi.groundColor.copy(hemiGround[0]).lerp(hemiGround[1], k);
    sun.intensity = lerp(CLEAR.sun, STORM.sun, k);
  }

  function resize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);

  return {
    renderer,
    scene,
    camera,
    sun,
    /** Keep the shadow area and sky centred on the player. */
    follow(x, y, z) {
      // Snap to shadow texels so shadows don't shimmer while moving.
      const texel = (sc.right - sc.left) / sun.shadow.mapSize.x;
      const sx = Math.round(x / texel) * texel;
      const sz = Math.round(z / texel) * texel;
      sun.target.position.set(sx, y, sz);
      sun.position.set(sx + sunOffset.x, y + sunOffset.y, sz + sunOffset.z);
      sky.position.copy(camera.position);
    },
    render() {
      renderer.render(scene, camera);
    },
    setWeather,
    resize,
  };
}

function createSkyDome() {
  const geo = new THREE.SphereGeometry(SKY_RADIUS, 32, 16);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const top = new THREE.Color(SKY_TOP);
  const horizon = new THREE.Color(SKY_HORIZON);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / SKY_RADIUS;
    const k = Math.pow(Math.max(0, y), 0.55);
    c.copy(horizon).lerp(top, k);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = -1;
  mesh.frustumCulled = false;
  return mesh;
}

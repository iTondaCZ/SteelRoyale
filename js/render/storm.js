// The storm wall: a tall glowing cylinder on the edge of the current safe circle.
import * as THREE from 'three';

const HEIGHT = 260;

export function createStormView(scene) {
  // Open-ended cylinder of radius 1 (scaled to the circle), brighter near the ground.
  const geo = new THREE.CylinderGeometry(1, 1, HEIGHT, 128, 8, true);
  geo.translate(0, HEIGHT / 2 - 30, 0);
  const colors = new Float32Array(geo.attributes.position.count * 3);
  const low = new THREE.Color('#d16bff');
  const high = new THREE.Color('#5a1f8f');
  const c = new THREE.Color();
  for (let i = 0; i < geo.attributes.position.count; i++) {
    const t = Math.min(1, (geo.attributes.position.getY(i) + 30) / HEIGHT);
    c.copy(low).lerp(high, Math.pow(t, 0.6));
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.32,
    side: THREE.DoubleSide,
    depthWrite: false,
    fog: false,
    blending: THREE.AdditiveBlending,
  });
  const wall = new THREE.Mesh(geo, mat);
  wall.frustumCulled = false;
  wall.renderOrder = 2;
  scene.add(wall);

  return {
    update(zone, time) {
      if (!zone || zone.current.r < 0.5) {
        wall.visible = !!zone && zone.current.r >= 0.5;
        return;
      }
      wall.visible = true;
      wall.position.set(zone.current.x, 0, zone.current.z);
      wall.scale.set(zone.current.r, 1, zone.current.r);
      mat.opacity = 0.28 + Math.sin(time * 1.7) * 0.05;
    },
  };
}

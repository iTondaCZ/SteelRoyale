// Third-person camera that sits on the shot line behind the shoulder, so the
// crosshair (screen centre) always matches where bullets go. When something is
// behind the player, the camera slides forward along that same line.
import { CAMERA, PLAYER } from '../config.js';
import { lookDir, lerp } from '../sim/vec.js';
import { shotOriginAt } from '../sim/weapons.js';

// Centre ray plus four offset rays act like a thick probe, so the camera
// can't slip through narrow gaps or graze wall edges.
const PROBE = [
  [0, 0],
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export function createCameraRig(camera, world) {
  let dist = CAMERA.distance;
  let fov = CAMERA.fov;
  let eye = PLAYER.eyeHeight;
  const origin = { x: 0, y: 0, z: 0 };
  const start = { x: 0, y: 0, z: 0 };
  const back = { x: 0, y: 0, z: 0 };
  const dir = { x: 0, y: 0, z: 0 };

  function probe(maxDist, yaw, pitch) {
    const r = CAMERA.probeRadius;
    const rx = Math.cos(yaw);
    const rz = -Math.sin(yaw);
    const ux = Math.sin(yaw) * Math.sin(pitch);
    const uy = Math.cos(pitch);
    const uz = Math.cos(yaw) * Math.sin(pitch);
    let best = maxDist;
    for (const [a, b] of PROBE) {
      start.x = origin.x + (rx * a + ux * b) * r;
      start.y = origin.y + uy * b * r;
      start.z = origin.z + (rz * a + uz * b) * r;
      const hit = world.raycast(start, back, maxDist, { ignoreCharacters: true });
      // An offset ray that starts inside a wall (t ≈ 0) says nothing useful.
      if (hit && (hit.t > 0.05 || (a === 0 && b === 0)) && hit.t < best) best = hit.t;
    }
    return best;
  }

  return {
    /**
     * Returns the distance from the camera to the shot origin (used to hide the player when too close).
     * opts: { crouching, scopeFov, sprinting }
     */
    update(pos, yaw, pitch, aiming, dt, { crouching = false, scopeFov = null, sprinting = false } = {}) {
      const k = 1 - Math.exp(-dt * 14);
      eye = lerp(eye, crouching ? PLAYER.crouchEyeHeight : PLAYER.eyeHeight, k);
      shotOriginAt(pos, yaw, world, origin, eye);
      lookDir(yaw, pitch, dir);

      const targetFov = aiming ? scopeFov || CAMERA.aimFov : sprinting ? CAMERA.fov + 6 : CAMERA.fov;
      dist = lerp(dist, aiming ? CAMERA.aimDistance : CAMERA.distance, k);
      fov = lerp(fov, targetFov, aiming && scopeFov ? Math.min(1, k * 2) : k);

      back.x = -dir.x;
      back.y = -dir.y;
      back.z = -dir.z;
      const free = probe(dist + 0.3, yaw, pitch);
      const d = free < dist + 0.3 ? Math.max(CAMERA.minDistance, free - 0.3) : dist;

      camera.position.set(origin.x + back.x * d, origin.y + back.y * d, origin.z + back.z * d);
      camera.rotation.set(pitch, yaw, 0, 'YXZ');
      if (Math.abs(camera.fov - fov) > 0.01) {
        camera.fov = fov;
        camera.updateProjectionMatrix();
      }
      return d;
    },
  };
}

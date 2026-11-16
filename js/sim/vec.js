// Small vector helpers on plain {x, y, z} objects (no Three.js in the simulation).
// Convention: yaw 0 looks toward −Z, positive yaw turns left, positive pitch looks up.

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (t) => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};

export function lookDir(yaw, pitch, out = {}) {
  const cp = Math.cos(pitch);
  out.x = -Math.sin(yaw) * cp;
  out.y = Math.sin(pitch);
  out.z = -Math.cos(yaw) * cp;
  return out;
}

export function forwardXZ(yaw) {
  return { x: -Math.sin(yaw), z: -Math.cos(yaw) };
}

export function rightXZ(yaw) {
  return { x: Math.cos(yaw), z: -Math.sin(yaw) };
}

export function normalize(v) {
  const l = Math.hypot(v.x, v.y, v.z) || 1;
  v.x /= l;
  v.y /= l;
  v.z /= l;
  return v;
}

/** Shortest signed difference between two angles, in (−π, π]. */
export function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

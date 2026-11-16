// Geometry primitives: circle-vs-box push-out and ray intersections.
// Ray directions must be normalised. Functions return the hit distance t, or null.

/** Push-out vector (XZ) that moves a circle of radius r out of the box, or null if not touching. */
export function circleBoxPush(cx, cz, r, box) {
  const px = cx < box.minX ? box.minX : cx > box.maxX ? box.maxX : cx;
  const pz = cz < box.minZ ? box.minZ : cz > box.maxZ ? box.maxZ : cz;
  const dx = cx - px;
  const dz = cz - pz;
  const d2 = dx * dx + dz * dz;
  if (d2 > 0) {
    if (d2 >= r * r) return null;
    const d = Math.sqrt(d2);
    const k = (r - d) / d;
    return { x: dx * k, z: dz * k };
  }
  // Centre is inside the box: leave through the closest side.
  const left = cx - box.minX;
  const right = box.maxX - cx;
  const back = cz - box.minZ;
  const front = box.maxZ - cz;
  const m = Math.min(left, right, back, front);
  if (m === left) return { x: -(left + r), z: 0 };
  if (m === right) return { x: right + r, z: 0 };
  if (m === back) return { x: 0, z: -(back + r) };
  return { x: 0, z: front + r };
}

/** True when the circle overlaps the box in XZ. */
export function circleOverlapsBox(cx, cz, r, box) {
  const px = cx < box.minX ? box.minX : cx > box.maxX ? box.maxX : cx;
  const pz = cz < box.minZ ? box.minZ : cz > box.maxZ ? box.maxZ : cz;
  const dx = cx - px;
  const dz = cz - pz;
  return dx * dx + dz * dz < r * r;
}

/** Slab test. Returns 0 if the origin is inside the box. */
export function rayBox(o, d, b, maxDist = Infinity) {
  let tmin = 0;
  let tmax = maxDist;

  if (Math.abs(d.x) < 1e-12) {
    if (o.x < b.minX || o.x > b.maxX) return null;
  } else {
    let t1 = (b.minX - o.x) / d.x;
    let t2 = (b.maxX - o.x) / d.x;
    if (t1 > t2) [t1, t2] = [t2, t1];
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }

  if (Math.abs(d.y) < 1e-12) {
    if (o.y < b.minY || o.y > b.maxY) return null;
  } else {
    let t1 = (b.minY - o.y) / d.y;
    let t2 = (b.maxY - o.y) / d.y;
    if (t1 > t2) [t1, t2] = [t2, t1];
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }

  if (Math.abs(d.z) < 1e-12) {
    if (o.z < b.minZ || o.z > b.maxZ) return null;
  } else {
    let t1 = (b.minZ - o.z) / d.z;
    let t2 = (b.maxZ - o.z) / d.z;
    if (t1 > t2) [t1, t2] = [t2, t1];
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }

  return tmin;
}

export function raySphere(o, d, c, r) {
  const ox = o.x - c.x;
  const oy = o.y - c.y;
  const oz = o.z - c.z;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const cc = ox * ox + oy * oy + oz * oz - r * r;
  if (cc < 0) return 0;
  const h = b * b - cc;
  if (h < 0) return null;
  const t = -b - Math.sqrt(h);
  return t >= 0 ? t : null;
}

/** Ray vs capsule (segment a→b with radius r). Based on Inigo Quilez's capsule intersection. */
export function rayCapsule(o, d, a, b, r) {
  const bax = b.x - a.x, bay = b.y - a.y, baz = b.z - a.z;
  const oax = o.x - a.x, oay = o.y - a.y, oaz = o.z - a.z;
  const baba = bax * bax + bay * bay + baz * baz;
  const bard = bax * d.x + bay * d.y + baz * d.z;
  const baoa = bax * oax + bay * oay + baz * oaz;
  const rdoa = d.x * oax + d.y * oay + d.z * oaz;
  const oaoa = oax * oax + oay * oay + oaz * oaz;
  const A = baba - bard * bard;

  if (A > 1e-9) {
    const B = baba * rdoa - baoa * bard;
    const C = baba * oaoa - baoa * baoa - r * r * baba;
    const h = B * B - A * C;
    if (h < 0) return null;
    const t = (-B - Math.sqrt(h)) / A;
    const y = baoa + t * bard;
    if (y > 0 && y < baba) return t >= 0 ? t : null;
  }
  // Hit one of the end spheres (or the ray runs parallel to the axis).
  const ta = raySphere(o, d, a, r);
  const tb = raySphere(o, d, b, r);
  if (ta === null) return tb;
  if (tb === null) return ta;
  return Math.min(ta, tb);
}

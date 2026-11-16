// Weapons: fire rate, magazine, reload, spread, hitscan shots, pellets and projectiles.
import { WEAPONS, RARITY, PLAYER } from '../config.js';
import { lookDir, rightXZ } from './vec.js';
import { dealDamage } from './damage.js';
import { eyeHeight } from './character.js';
import { spawnProjectile } from './projectiles.js';

export function createWeapon(type, rarity = 'common') {
  const def = WEAPONS[type];
  if (!def) throw new Error(`Unknown weapon: ${type}`);
  if (!RARITY[rarity]) throw new Error(`Unknown rarity: ${rarity}`);
  return { kind: 'weapon', type, rarity, mag: def.mag, cooldown: 0, reloadLeft: 0, bloom: 0 };
}

export const weaponDef = (w) => WEAPONS[w.type];

export function damageAtRange(def, rarity, dist) {
  const base = def.damage * RARITY[rarity].dmgMul;
  if (dist <= def.falloffStart) return base;
  const k = Math.min(1, (dist - def.falloffStart) / (def.range - def.falloffStart));
  return base * (1 - (1 - def.falloffMin) * k);
}

export function reloadDuration(def, rarity) {
  return def.reloadTime * RARITY[rarity].reloadMul;
}

/** Current cone half-angle in degrees. */
export function spreadDeg(c) {
  const w = c.weapon;
  if (!w) return 0;
  const def = WEAPONS[w.type];
  let s = (c.aiming ? def.spreadAim : def.spreadHip) + w.bloom;
  if (!c.onGround && !c.mantle) s += def.spreadAir;
  else if (c.speed > 1 && !(c.aiming && def.spreadAim === 0)) s *= 1 + 0.25 * Math.min(c.speed / PLAYER.walkSpeed, 1.5);
  if (c.crouching) s *= PLAYER.crouchSpreadMul;
  return s;
}

const _eye = { x: 0, y: 0, z: 0 };
const _right = { x: 0, y: 0, z: 0 };

/**
 * Where shots start: a point beside the head (the camera sits behind it on the same line,
 * so the crosshair is exact). Falls back to the eye if a wall is between eye and shoulder,
 * so shots can never start on the far side of a wall.
 */
export function shotOriginAt(pos, yaw, world, out = {}, eye = PLAYER.eyeHeight) {
  _eye.x = pos.x;
  _eye.y = pos.y + eye + PLAYER.shoulderUp;
  _eye.z = pos.z;
  const r = rightXZ(yaw);
  _right.x = r.x;
  _right.z = r.z;
  const blocked = world.raycast(_eye, _right, PLAYER.shoulderRight + 0.1, {
    ignoreCharacters: true,
    ignoreTerrain: true,
  });
  out.x = blocked ? _eye.x : _eye.x + r.x * PLAYER.shoulderRight;
  out.y = _eye.y;
  out.z = blocked ? _eye.z : _eye.z + r.z * PLAYER.shoulderRight;
  return out;
}

export const shotOrigin = (c, world, out) => shotOriginAt(c.pos, c.yaw, world, out, eyeHeight(c));

/** Random direction inside a cone of half-angle `angle` (radians) around d. */
function applySpread(d, angle, rng) {
  if (angle <= 0) return { x: d.x, y: d.y, z: d.z };
  const a = angle * Math.sqrt(rng());
  const phi = rng() * Math.PI * 2;
  let ux = 0, uy = 1, uz = 0;
  if (Math.abs(d.y) > 0.99) { ux = 1; uy = 0; }
  let rx = d.y * uz - d.z * uy;
  let ry = d.z * ux - d.x * uz;
  let rz = d.x * uy - d.y * ux;
  const rl = Math.hypot(rx, ry, rz);
  rx /= rl; ry /= rl; rz /= rl;
  const vx = ry * d.z - rz * d.y;
  const vy = rz * d.x - rx * d.z;
  const vz = rx * d.y - ry * d.x;
  const t = Math.tan(a);
  const c = Math.cos(phi) * t;
  const s = Math.sin(phi) * t;
  const x = d.x + rx * c + vx * s;
  const y = d.y + ry * c + vy * s;
  const z = d.z + rz * c + vz * s;
  const l = Math.hypot(x, y, z);
  return { x: x / l, y: y / l, z: z / l };
}

function fireShot(c, w, def, world, rng, events) {
  const origin = shotOrigin(c, world);
  const aimDir = lookDir(c.yaw, c.pitch);
  const spread = (spreadDeg(c) * Math.PI) / 180;

  w.mag -= 1;
  w.cooldown = 1 / def.fireRate;
  w.bloom = Math.min(def.bloomMax, w.bloom + def.bloomPerShot);
  c.firing = true;

  if (def.projectile) {
    const dir = applySpread(aimDir, spread, rng);
    spawnProjectile(world, c, w, origin, dir);
    events.push({ type: 'shot', shooterId: c.id, weapon: w.type, from: origin, to: null, hitKind: null, projectile: true });
    return;
  }

  const pellets = def.pellets || 1;
  const perTarget = new Map(); // targetId -> { dmg, head, point }
  for (let p = 0; p < pellets; p++) {
    const dir = applySpread(aimDir, spread, rng);
    const hit = world.raycast(origin, dir, def.range, { ignoreId: c.id });
    const to = hit
      ? hit.point
      : { x: origin.x + dir.x * def.range, y: origin.y + dir.y * def.range, z: origin.z + dir.z * def.range };
    events.push({ type: 'shot', shooterId: c.id, weapon: w.type, from: origin, to, hitKind: hit ? hit.kind : null, pellet: p > 0 });
    if (hit && hit.kind === 'character') {
      const head = hit.zone === 'head';
      const dmg = damageAtRange(def, w.rarity, hit.t) * (head ? def.headMul : 1);
      const acc = perTarget.get(hit.characterId) || { dmg: 0, head: false, point: hit.point };
      acc.dmg += dmg;
      acc.head = acc.head || head;
      perTarget.set(hit.characterId, acc);
    }
  }
  for (const [id, acc] of perTarget) {
    const target = world.characters.get(id);
    if (target && target.alive) {
      dealDamage(c, target, Math.round(acc.dmg), { weapon: w.type, headshot: acc.head, point: acc.point }, events);
    }
  }
}

export function tickWeapon(c, cmd, world, dt, rng, events) {
  const w = c.weapon;
  const firePressed = cmd.fire && !c.lastFire;
  c.lastFire = !!cmd.fire;
  c.firing = false;
  if (!w || !c.alive) return;
  const def = WEAPONS[w.type];

  if (c.equipLeft > 0) c.equipLeft = Math.max(0, c.equipLeft - dt);
  if (w.cooldown > 0) w.cooldown = Math.max(0, w.cooldown - dt);
  if (w.bloom > 0) w.bloom = Math.max(0, w.bloom - def.bloomRecover * dt);

  if (w.reloadLeft > 0) {
    w.reloadLeft -= dt;
    if (w.reloadLeft <= 1e-9) {
      w.reloadLeft = 0;
      const take = Math.min(def.mag - w.mag, c.ammo[def.ammo] || 0);
      w.mag += take;
      c.ammo[def.ammo] -= take;
      events.push({ type: 'reloaded', id: c.id });
    }
    return;
  }

  if (c.mantle || c.useItem || (c.equipLeft || 0) > 0) return;

  const reserve = c.ammo[def.ammo] || 0;
  if ((cmd.reload || (cmd.fire && w.mag === 0)) && w.mag < def.mag && reserve > 0) {
    w.reloadLeft = reloadDuration(def, w.rarity);
    events.push({ type: 'reload', id: c.id });
    return;
  }

  const trigger = def.auto ? cmd.fire : firePressed;
  if (trigger && w.mag > 0 && w.cooldown <= 0 && !c.sprinting) fireShot(c, w, def, world, rng, events);
}

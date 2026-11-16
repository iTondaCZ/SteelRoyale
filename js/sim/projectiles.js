// Travelling projectiles (sniper bullets, rockets) and explosions.
import { WEAPONS, HITBOX } from '../config.js';
import { dealDamage } from './damage.js';
import { damageAtRange } from './weapons.js';

let nextId = 1;

export function spawnProjectile(world, owner, weapon, origin, dir) {
  const def = WEAPONS[weapon.type];
  const p = {
    id: nextId++,
    ownerId: owner.id,
    weapon: weapon.type,
    rarity: weapon.rarity,
    pos: { x: origin.x, y: origin.y, z: origin.z },
    vel: { x: dir.x * def.projectile.speed, y: dir.y * def.projectile.speed, z: dir.z * def.projectile.speed },
    gravity: def.projectile.gravity,
    travelled: 0,
  };
  world.projectiles.push(p);
  return p;
}

const _d = { x: 0, y: 0, z: 0 };

export function tickProjectiles(world, dt, events) {
  const list = world.projectiles;
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i];
    const def = WEAPONS[p.weapon];
    p.vel.y -= p.gravity * dt;
    const step = Math.hypot(p.vel.x, p.vel.y, p.vel.z) * dt;
    _d.x = p.vel.x * dt / step;
    _d.y = p.vel.y * dt / step;
    _d.z = p.vel.z * dt / step;
    const hit = world.raycast(p.pos, _d, step, { ignoreId: p.ownerId });
    if (hit) {
      p.travelled += hit.t;
      const owner = world.characters.get(p.ownerId) || null;
      if (def.splash) {
        explode(world, owner, def, p.rarity, { x: hit.point.x - _d.x * 0.15, y: hit.point.y - _d.y * 0.15, z: hit.point.z - _d.z * 0.15 }, events);
      } else {
        events.push({ type: 'impact', weapon: p.weapon, point: hit.point, hitKind: hit.kind });
        if (hit.kind === 'character') {
          const target = world.characters.get(hit.characterId);
          const head = hit.zone === 'head';
          const dmg = damageAtRange(def, p.rarity, p.travelled) * (head ? def.headMul : 1);
          if (target && target.alive) dealDamage(owner, target, Math.round(dmg), { weapon: p.weapon, headshot: head, point: hit.point }, events);
        }
      }
      list.splice(i, 1);
      continue;
    }
    p.pos.x += p.vel.x * dt;
    p.pos.y += p.vel.y * dt;
    p.pos.z += p.vel.z * dt;
    p.travelled += step;
    if (p.travelled > def.range || p.pos.y < -50) list.splice(i, 1);
  }
}

/** Blast damage falls off with distance and is blocked by walls. */
export function explode(world, owner, def, rarity, at, events) {
  const { radius, minMul } = def.splash;
  const base = damageAtRange(def, rarity, 0);
  events.push({ type: 'explosion', point: { ...at }, radius });
  for (const c of world.characters.values()) {
    if (!c.alive) continue;
    const cy = c.pos.y + (c.crouching ? HITBOX.crouchBody.top : HITBOX.body.top) * 0.7;
    const dx = c.pos.x - at.x;
    const dy = cy - at.y;
    const dz = c.pos.z - at.z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist > radius) continue;
    if (dist > 0.3) {
      const dir = { x: dx / dist, y: dy / dist, z: dz / dist };
      const wall = world.raycast(at, dir, dist - 0.3, { ignoreCharacters: true, ignoreTerrain: false });
      if (wall) continue;
    }
    const dmg = base * (1 - (1 - minMul) * (dist / radius));
    dealDamage(owner, c, Math.round(dmg), { weapon: def.id, point: { x: c.pos.x, y: cy, z: c.pos.z } }, events);
  }
}

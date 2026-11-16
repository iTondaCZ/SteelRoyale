// The storm. The safe circle shrinks in phases (wait, then shrink toward the next circle).
// Anyone outside the current circle loses health once per second; shield doesn't help.
import { ZONE } from '../config.js';
import { dealDamage } from './damage.js';

export const isInside = (circle, x, z, margin = 0) => (x - circle.x) ** 2 + (z - circle.z) ** 2 <= (circle.r - margin) ** 2;

/** Pick the next safe circle: fully inside `outer`, preferably centred on land. */
function nextCircle(outer, radius, terrain, rng, landBias = true) {
  const slack = Math.max(0, outer.r - radius);
  let fallback = null;
  for (let i = 0; i < 40; i++) {
    const a = rng() * Math.PI * 2;
    const d = Math.sqrt(rng()) * slack * 0.9;
    const c = { x: outer.x + Math.cos(a) * d, z: outer.z + Math.sin(a) * d, r: radius };
    if (!fallback) fallback = c;
    const lim = terrain.size / 2 - 10;
    if (Math.abs(c.x) > lim || Math.abs(c.z) > lim) continue;
    if (!landBias || terrain.heightAt(c.x, c.z) > 1.5) return c;
  }
  return fallback;
}

export function createZone({ size, terrain, rng }) {
  const scale = size / ZONE.baseSize;
  const phases = ZONE.phases.map((p) => ({ ...p, radius: p.radius * scale }));
  const start = { x: 0, z: 0, r: (size / 2) * Math.SQRT2 + 5 };
  const zone = {
    phases,
    phase: 0,
    stage: 'wait', // 'wait' | 'shrink' | 'done'
    timer: phases[0].wait, // seconds left in this stage
    from: { ...start },
    current: { ...start },
    target: nextCircle(start, phases[0].radius, terrain, rng),
    dps: phases[0].dps,
    terrain,
    rng,
    tickAcc: 0,
  };
  return zone;
}

/** Advance the storm and damage everyone outside it once per second. */
export function tickZone(zone, dt, characters, events) {
  if (zone.stage !== 'done') {
    zone.timer -= dt;
    if (zone.stage === 'wait' && zone.timer <= 0) {
      zone.stage = 'shrink';
      zone.timer += zone.phases[zone.phase].shrink;
      zone.from = { ...zone.current };
      events.push({ type: 'zoneShrink', phase: zone.phase });
    }
    if (zone.stage === 'shrink') {
      const p = zone.phases[zone.phase];
      const k = Math.min(1, 1 - zone.timer / p.shrink);
      zone.current.x = zone.from.x + (zone.target.x - zone.from.x) * k;
      zone.current.z = zone.from.z + (zone.target.z - zone.from.z) * k;
      zone.current.r = zone.from.r + (zone.target.r - zone.from.r) * k;
      if (zone.timer <= 0) {
        zone.current = { ...zone.target };
        zone.phase++;
        if (zone.phase >= zone.phases.length) {
          zone.stage = 'done';
          zone.timer = 0;
          zone.phase = zone.phases.length - 1;
        } else {
          const next = zone.phases[zone.phase];
          zone.stage = 'wait';
          zone.timer += next.wait;
          zone.dps = next.dps;
          zone.target = nextCircle(zone.current, next.radius, zone.terrain, zone.rng, next.radius > 20);
          events.push({ type: 'zoneWait', phase: zone.phase });
        }
      }
    }
  }

  // Damage ticks once per second.
  zone.tickAcc += dt;
  if (zone.tickAcc < 1) return;
  zone.tickAcc -= 1;
  for (const c of characters) {
    if (!c.alive || isInside(zone.current, c.pos.x, c.pos.z)) continue;
    dealDamage(null, c, zone.dps, { bypassShield: true, weapon: 'zone', point: { x: c.pos.x, y: c.pos.y + 1, z: c.pos.z } }, events);
  }
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { createTerrain } from '../js/sim/terrain.js';
import { createWorld } from '../js/sim/world.js';
import { createCharacter } from '../js/sim/character.js';
import { createWeapon, tickWeapon, spreadDeg } from '../js/sim/weapons.js';
import { tickProjectiles } from '../js/sim/projectiles.js';
import { addItem, selectSlot } from '../js/sim/inventory.js';
import { createRng } from '../js/sim/rng.js';
import { TICK_DT, WEAPONS } from '../js/config.js';

const flatWorld = () => createWorld(createTerrain({ size: 600, cellSize: 4, heightFn: () => 0 }));
const cmd = (o = {}) => ({
  moveX: 0, moveZ: 0, yaw: 0, pitch: 0, jump: false, sprint: false, crouch: false, fire: false, aim: false,
  reload: false, ...o,
});

function setup(type, rarity = 'common') {
  const world = flatWorld();
  const shooter = createCharacter({ id: 1, name: 'shooter', pos: { x: 0, y: 0, z: 0 } });
  shooter.onGround = true;
  world.characters.set(1, shooter);
  addItem(shooter, createWeapon(type, rarity));
  shooter.equipLeft = 0;
  shooter.ammo[WEAPONS[type].ammo] = 100;
  return { world, shooter, rng: createRng(3), events: [] };
}

function target(world, id, x, z, shield = 0) {
  const t = createCharacter({ id, name: `t${id}`, pos: { x, y: 0, z } });
  t.shield = shield;
  world.characters.set(id, t);
  return t;
}

// Aim from the shot origin at a point; returns {yaw, pitch}.
function aimAt(shooter, world, p) {
  const o = { x: shooter.pos.x + 0.7, y: 1.87, z: shooter.pos.z }; // shoulder: eye 1.62 + 0.25 up, 0.7 right
  const dx = p.x - o.x;
  const dy = p.y - o.y;
  const dz = p.z - o.z;
  return { yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) };
}

function simulate(s, command, seconds) {
  for (let i = 0; i < Math.round(seconds / TICK_DT); i++) {
    const c = typeof command === 'function' ? command(i) : command;
    s.shooter.yaw = c.yaw;
    s.shooter.pitch = c.pitch;
    s.shooter.aiming = !!c.aim;
    tickWeapon(s.shooter, c, s.world, TICK_DT, s.rng, s.events);
    tickProjectiles(s.world, TICK_DT, s.events);
  }
  return s.events;
}

const shots = (events) => events.filter((e) => e.type === 'shot' && !e.pellet).length;

test('semi-auto pistol fires once per trigger pull', () => {
  const s = setup('pistol');
  simulate(s, cmd({ fire: true }), 1);
  assert.equal(shots(s.events), 1);
  // press every 12 ticks (0.2 s, slower than the 6.5/s fire rate): 4 more presses in 1 s
  simulate(s, (i) => cmd({ fire: i % 12 < 6 }), 1);
  assert.equal(shots(s.events), 5);
});

test('shotgun pellets on one target add up to a single hit', () => {
  const s = setup('shotgun');
  const t = target(s.world, 2, 0.7, -4, 150);
  const aim = aimAt(s.shooter, s.world, { x: 0.7, y: 1.0, z: -4 });
  simulate(s, cmd({ fire: true, aim: true, ...aim }), TICK_DT);
  const hits = s.events.filter((e) => e.type === 'hit' && e.targetId === 2);
  assert.equal(hits.length, 1);
  assert.ok(hits[0].shieldDamage + hits[0].healthDamage > 50);
  assert.ok(t.shield < 150);
});

test('sniper bullets travel instead of hitting instantly', () => {
  const s = setup('sniper', 'rare');
  target(s.world, 2, 0.7, -100);
  const aim = aimAt(s.shooter, s.world, { x: 0.7, y: 1.0, z: -100 });
  simulate(s, cmd({ fire: true, aim: true, ...aim }), TICK_DT);
  assert.equal(s.events.filter((e) => e.type === 'hit').length, 0);
  assert.equal(s.world.projectiles.length, 1);
  simulate(s, cmd({ ...aim, aim: true }), 0.4);
  assert.equal(s.events.filter((e) => e.type === 'hit' && e.targetId === 2).length, 1);
  assert.equal(s.world.projectiles.length, 0);
});

test('a scoped sniper is perfectly accurate, hip-fire is not', () => {
  const s = setup('sniper', 'rare');
  s.shooter.aiming = true;
  assert.equal(spreadDeg(s.shooter), 0);
  s.shooter.aiming = false;
  assert.ok(spreadDeg(s.shooter) > 3);
});

test('rockets explode with splash damage that falls off, and walls block it', () => {
  const s = setup('rocket', 'epic');
  const near = target(s.world, 2, 1.5, -20);
  const far = target(s.world, 3, 4.5, -20);
  const hidden = target(s.world, 4, -3.2, -20);
  s.world.addBox({ minX: -2.6, minY: 0, minZ: -23, maxX: -2.3, maxY: 3, maxZ: -17 });
  const aim = aimAt(s.shooter, s.world, { x: 0.7, y: 0.0, z: -20 });
  simulate(s, cmd({ fire: true, aim: true, ...aim }), TICK_DT);
  simulate(s, cmd({ ...aim }), 1);
  assert.ok(s.events.some((e) => e.type === 'explosion'));
  const dmg = (c) => 100 - c.health;
  assert.ok(dmg(near) > dmg(far), `near ${dmg(near)} far ${dmg(far)}`);
  assert.ok(dmg(far) > 0);
  assert.equal(dmg(hidden), 0);
});

test('switching weapons takes a moment before you can fire', () => {
  const s = setup('ar');
  addItem(s.shooter, createWeapon('smg', 'common'));
  s.shooter.ammo.light = 100;
  selectSlot(s.shooter, 1);
  simulate(s, cmd({ fire: true }), 0.2);
  assert.equal(shots(s.events), 0);
  simulate(s, cmd({ fire: true }), 0.3);
  assert.ok(shots(s.events) > 0);
});

test('higher rarity hits harder', () => {
  const a = setup('ar', 'common');
  const b = setup('ar', 'legendary');
  for (const s of [a, b]) {
    target(s.world, 2, 0.7, -10, 0);
    const aim = aimAt(s.shooter, s.world, { x: 0.7, y: 1.0, z: -10 });
    simulate(s, cmd({ fire: true, aim: true, ...aim }), TICK_DT);
  }
  const hitOf = (s) => s.events.find((e) => e.type === 'hit');
  assert.ok(hitOf(b).healthDamage > hitOf(a).healthDamage);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createTerrain } from '../js/sim/terrain.js';
import { createWorld } from '../js/sim/world.js';
import { createCharacter } from '../js/sim/character.js';
import { createWeapon, tickWeapon, damageAtRange, shotOrigin } from '../js/sim/weapons.js';
import { createRng } from '../js/sim/rng.js';
import { TICK_DT, WEAPONS, PLAYER } from '../js/config.js';

const cmd = (o = {}) => ({
  moveX: 0, moveZ: 0, yaw: 0, pitch: 0, jump: false, sprint: false, fire: false, aim: false, reload: false, ...o,
});

function setup(reserve = 90) {
  const world = createWorld(createTerrain({ size: 200, cellSize: 2, heightFn: () => 0 }));
  const c = createCharacter({ id: 1, name: 'shooter', pos: { x: 0, y: 0, z: 0 } });
  c.onGround = true;
  c.weapon = createWeapon('ar', 'common');
  c.ammo.medium = reserve;
  world.characters.set(c.id, c);
  return { world, c, rng: createRng(1), events: [] };
}
const ticks = (s) => Math.round(s / TICK_DT);
const shots = (events) => events.filter((e) => e.type === 'shot').length;

test('holding fire for 1 s fires 6 shots', () => {
  const { world, c, rng, events } = setup();
  for (let i = 0; i < ticks(1); i++) tickWeapon(c, cmd({ fire: true }), world, TICK_DT, rng, events);
  assert.equal(shots(events), 6);
  assert.equal(c.weapon.mag, 24);
});

test('the mag empties, then holding fire auto-reloads from the reserve', () => {
  const { world, c, rng, events } = setup(90);
  for (let i = 0; i < ticks(5.6); i++) tickWeapon(c, cmd({ fire: true }), world, TICK_DT, rng, events);
  assert.equal(shots(events), 30);
  assert.equal(c.weapon.mag, 0);
  assert.ok(c.weapon.reloadLeft > 0, 'reload should have started');
  for (let i = 0; i < ticks(WEAPONS.ar.reloadTime + 0.05); i++) tickWeapon(c, cmd(), world, TICK_DT, rng, events);
  assert.equal(c.weapon.mag, 30);
  assert.equal(c.ammo.medium, 60);
});

test('no shots are fired while reloading', () => {
  const { world, c, rng, events } = setup();
  c.weapon.mag = 10;
  tickWeapon(c, cmd({ reload: true }), world, TICK_DT, rng, events);
  for (let i = 0; i < ticks(1); i++) tickWeapon(c, cmd({ fire: true }), world, TICK_DT, rng, events);
  assert.equal(shots(events), 0);
});

test('with no reserve ammo an empty mag stays empty', () => {
  const { world, c, rng, events } = setup(0);
  c.weapon.mag = 0;
  for (let i = 0; i < ticks(3); i++) tickWeapon(c, cmd({ fire: true }), world, TICK_DT, rng, events);
  assert.equal(c.weapon.reloadLeft, 0);
  assert.equal(shots(events), 0);
});

test('damage is full up close and at least 75% at max range', () => {
  const def = WEAPONS.ar;
  assert.equal(damageAtRange(def, 'common', 10), 32);
  assert.ok(damageAtRange(def, 'common', def.range) >= 32 * 0.75 - 1e-9);
  assert.ok(damageAtRange(def, 'common', 150) < 32);
  assert.ok(damageAtRange(def, 'legendary', 10) > 32);
});

test('shotOrigin uses the shoulder, but falls back to the eye when a wall is in between', () => {
  const { world, c } = setup();
  const o = shotOrigin(c, world);
  assert.ok(Math.abs(o.x - PLAYER.shoulderRight) < 1e-9); // yaw 0 → right is +X
  world.addBox({ minX: 0.3, minY: 0, minZ: -2, maxX: 0.5, maxY: 4, maxZ: 2 });
  const o2 = shotOrigin(c, world);
  assert.ok(Math.abs(o2.x) < 1e-9);
});

test('a shot at a wall in front stops at the wall', () => {
  const { world, c, rng, events } = setup();
  world.addBox({ minX: -5, minY: 0, minZ: -6, maxX: 5, maxY: 4, maxZ: -5 });
  tickWeapon(c, cmd({ fire: true, aim: true }), world, TICK_DT, rng, events);
  const shot = events.find((e) => e.type === 'shot');
  assert.equal(shot.hitKind, 'box');
  assert.ok(Math.abs(shot.to.z - -5) < 0.05);
});

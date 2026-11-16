import test from 'node:test';
import assert from 'node:assert/strict';
import { createTerrain } from '../js/sim/terrain.js';
import { createWorld } from '../js/sim/world.js';
import { createCharacter, stepCharacter, characterHeight } from '../js/sim/character.js';
import { TICK_DT, PLAYER } from '../js/config.js';

const flatWorld = () => createWorld(createTerrain({ size: 100, cellSize: 2, heightFn: () => 0 }));
const box = (minX, minY, minZ, maxX, maxY, maxZ) => ({ minX, minY, minZ, maxX, maxY, maxZ });
const cmd = (o = {}) => ({
  moveX: 0, moveZ: 0, yaw: 0, pitch: 0, jump: false, sprint: false, crouch: false, fire: false, aim: false, reload: false, ...o,
});
function run(c, w, command, seconds, events = []) {
  const n = Math.round(seconds / TICK_DT);
  for (let i = 0; i < n; i++) stepCharacter(c, typeof command === 'function' ? command(i) : command, w, TICK_DT, events);
  return events;
}
function spawn(w, x = 0, y = 0, z = 0) {
  const c = createCharacter({ id: 1, name: 'a', pos: { x, y, z } });
  run(c, w, cmd(), 0.2);
  return c;
}

test('crouching lowers the character and slows it down', () => {
  const w = flatWorld();
  const walker = spawn(w);
  run(walker, w, cmd({ moveZ: 1 }), 2);
  const croucher = spawn(w);
  run(croucher, w, cmd({ moveZ: 1, crouch: true }), 2);
  assert.equal(croucher.crouching, true);
  assert.equal(characterHeight(croucher), PLAYER.crouchHeight);
  assert.ok(-croucher.pos.z < -walker.pos.z * 0.65);
});

test('a crouched character fits under a low gap a standing one cannot pass', () => {
  const w = flatWorld();
  w.addBox(box(-3, 1.4, -8, 3, 3, -4)); // overhang 1.4 m above the ground
  const standing = spawn(w);
  run(standing, w, cmd({ moveZ: 1 }), 3);
  assert.ok(standing.pos.z > -4 + 0.1, `standing went under: ${standing.pos.z}`);
  const crouched = spawn(w);
  run(crouched, w, cmd({ moveZ: 1, crouch: true }), 5);
  assert.ok(crouched.pos.z < -8, `crouched got stuck: ${crouched.pos.z}`);
});

test('cannot stand up under a low ceiling', () => {
  const w = flatWorld();
  w.addBox(box(-3, 1.4, -3, 3, 3, 3));
  const c = createCharacter({ id: 1, name: 'a', pos: { x: 0, y: 0, z: 0 } });
  run(c, w, cmd({ crouch: true }), 0.3);
  run(c, w, cmd({ crouch: false }), 0.3);
  assert.equal(c.crouching, true);
});

test('crouching while sprinting starts a slide that slows to crouch speed', () => {
  const w = flatWorld();
  const c = spawn(w, 0, 0, 40);
  run(c, w, cmd({ moveZ: 1, sprint: true }), 1);
  run(c, w, cmd({ moveZ: 1, sprint: true, crouch: true }), 2 * TICK_DT);
  assert.ok(c.slideTime > 0, 'slide should start');
  assert.ok(c.speed > PLAYER.sprintSpeed, `slide speed ${c.speed}`);
  run(c, w, cmd({ moveZ: 1, crouch: true }), 1.5);
  assert.ok(c.speed <= PLAYER.crouchSpeed + 0.05, `after slide ${c.speed}`);
});

test('pressing jump at a chest-high ledge mantles on top of it', () => {
  const w = flatWorld();
  w.addBox(box(-2, 0, -4, 2, 1.5, -1)); // ledge face at z = -1
  const c = spawn(w, 0, 0, 0);
  run(c, w, cmd({ moveZ: 1 }), 0.5); // walk up to the face
  run(c, w, (i) => cmd({ moveZ: 1, jump: i === 0 }), 1.0);
  assert.ok(Math.abs(c.pos.y - 1.5) < 0.01, `y=${c.pos.y}`);
  assert.ok(c.pos.z < -1, 'should be standing on the ledge');
});

test('a wall that is too tall cannot be mantled', () => {
  const w = flatWorld();
  w.addBox(box(-2, 0, -4, 2, 3.2, -1));
  const c = spawn(w);
  run(c, w, cmd({ moveZ: 1 }), 0.5);
  run(c, w, (i) => cmd({ moveZ: 1, jump: i === 0 }), 1.5);
  assert.ok(c.pos.y < 0.01);
  assert.equal(c.mantle, null);
});

test('no mantle when there is no headroom on top of the ledge', () => {
  const w = flatWorld();
  w.addBox(box(-2, 0, -4, 2, 1.5, -1));
  w.addBox(box(-2, 2.2, -4, 2, 3, -1.2)); // ceiling 0.7 m above the ledge
  const c = spawn(w);
  run(c, w, cmd({ moveZ: 1 }), 0.5);
  run(c, w, (i) => cmd({ moveZ: 1, jump: i === 0 }), 1.0);
  assert.ok(c.pos.y < 1.4);
});

test('jumping just after walking off an edge still works (coyote time)', () => {
  const w = flatWorld();
  w.addBox(box(-3, 0, -2, 3, 3, 3)); // platform 3 m high, edge at z = -2
  const c = createCharacter({ id: 1, name: 'a', pos: { x: 0, y: 3, z: 0 } });
  run(c, w, cmd(), 0.2);
  // walk forward until we leave the edge
  let ticks = 0;
  while (c.onGround && ticks++ < 600) stepCharacter(c, cmd({ moveZ: 1 }), w, TICK_DT, []);
  stepCharacter(c, cmd({ moveZ: 1, jump: true }), w, TICK_DT, []);
  assert.ok(c.vel.y > 0, `expected a jump, vel.y=${c.vel.y}`);
});

test('a jump pressed just before landing happens on landing (jump buffer)', () => {
  const w = flatWorld();
  const c = createCharacter({ id: 1, name: 'a', pos: { x: 0, y: 0.6, z: 0 } });
  // falling 0.6 m takes ~0.23 s; press jump only during the last few ticks before touchdown
  let jumped = false;
  for (let i = 0; i < 40; i++) {
    const nearGround = c.pos.y < 0.2 && !c.onGround;
    stepCharacter(c, cmd({ jump: nearGround }), w, TICK_DT, []);
    if (c.vel.y > 1) jumped = true;
  }
  assert.ok(jumped);
});

test('a long fall hurts (ignoring shield), a short one does not', () => {
  const w = flatWorld();
  const high = createCharacter({ id: 1, name: 'a', pos: { x: 0, y: 12, z: 0 } });
  high.shield = 50;
  const events = run(high, w, cmd(), 2);
  assert.ok(high.health < 100, 'should take fall damage');
  assert.equal(high.shield, 50);
  assert.ok(events.some((e) => e.type === 'hit' && e.targetId === 1));

  const low = createCharacter({ id: 2, name: 'b', pos: { x: 0, y: 3, z: 0 } });
  run(low, w, cmd(), 2);
  assert.equal(low.health, 100);
});

test('wading through water is slower', () => {
  const dry = flatWorld();
  const wet = flatWorld();
  wet.waterLevel = 1;
  const a = spawn(dry);
  const b = spawn(wet);
  run(a, dry, cmd({ moveZ: 1, sprint: true }), 2);
  run(b, wet, cmd({ moveZ: 1, sprint: true }), 2);
  assert.ok(-b.pos.z < -a.pos.z * 0.6);
});

test('crouched characters have a lower hitbox', () => {
  const w = flatWorld();
  const c = createCharacter({ id: 1, name: 'a', pos: { x: 0, y: 0, z: -10 } });
  w.characters.set(1, c);
  const headHigh = { x: 0, y: 1.58, z: 0 };
  const dir = { x: 0, y: 0, z: -1 };
  assert.equal(w.raycast(headHigh, dir, 50).zone, 'head');
  run(c, w, cmd({ crouch: true }), 0.2);
  assert.equal(w.raycast(headHigh, dir, 50, { ignoreTerrain: true }), null);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createTerrain } from '../js/sim/terrain.js';
import { createWorld } from '../js/sim/world.js';
import { createCharacter, stepCharacter } from '../js/sim/character.js';
import { TICK_DT, PLAYER } from '../js/config.js';

const flatWorld = () => createWorld(createTerrain({ size: 100, cellSize: 2, heightFn: () => 0 }));
const cmd = (o = {}) => ({
  moveX: 0, moveZ: 0, yaw: 0, pitch: 0, jump: false, sprint: false, fire: false, aim: false, reload: false, ...o,
});
const run = (c, w, command, seconds) => {
  const n = Math.round(seconds / TICK_DT);
  for (let i = 0; i < n; i++) stepCharacter(c, command, w, TICK_DT);
};
const box = (minX, minY, minZ, maxX, maxY, maxZ) => ({ minX, minY, minZ, maxX, maxY, maxZ });

test('a falling character lands on the terrain', () => {
  const w = flatWorld();
  const c = createCharacter({ id: 1, name: 'a', pos: { x: 0, y: 5, z: 0 } });
  run(c, w, cmd(), 2);
  assert.ok(Math.abs(c.pos.y) < 1e-9);
  assert.equal(c.onGround, true);
});

test('walking forward into a wall stops at the wall', () => {
  const w = flatWorld();
  w.addBox(box(-5, 0, -10.25, 5, 4, -10));
  const c = createCharacter({ id: 1, name: 'a', pos: { x: 0, y: 0, z: 0 } });
  run(c, w, cmd({ moveZ: 1 }), 4);
  assert.ok(c.pos.z >= -10 + PLAYER.radius - 1e-6, `went through: z=${c.pos.z}`);
  assert.ok(c.pos.z < -9.5, `did not reach the wall: z=${c.pos.z}`);
});

test('standing on top of a box', () => {
  const w = flatWorld();
  w.addBox(box(-2, 0, -2, 2, 1, 2));
  const c = createCharacter({ id: 1, name: 'a', pos: { x: 0, y: 3, z: 0 } });
  run(c, w, cmd(), 1.5);
  assert.ok(Math.abs(c.pos.y - 1) < 1e-9);
  assert.equal(c.onGround, true);
});

test('steps up a 0.4 m box but is blocked by a 1 m box', () => {
  const w = flatWorld();
  w.addBox(box(-3, 0, -6, 3, 0.4, -4)); // low step in front (−Z)
  const c = createCharacter({ id: 1, name: 'a', pos: { x: 0, y: 0, z: 0 } });
  run(c, w, cmd(), 0.2);
  run(c, w, cmd({ moveZ: 1 }), 1.2);
  assert.ok(Math.abs(c.pos.y - 0.4) < 1e-9, `expected to be on the step, y=${c.pos.y}`);

  const w2 = flatWorld();
  w2.addBox(box(-3, 0, -6, 3, 1, -4));
  const c2 = createCharacter({ id: 1, name: 'b', pos: { x: 0, y: 0, z: 0 } });
  run(c2, w2, cmd(), 0.2);
  run(c2, w2, cmd({ moveZ: 1 }), 1.2);
  assert.ok(c2.pos.y < 0.01);
  assert.ok(c2.pos.z >= -4 + PLAYER.radius - 1e-6);
});

test('jumping leaves the ground and lands again', () => {
  const w = flatWorld();
  const c = createCharacter({ id: 1, name: 'a', pos: { x: 0, y: 0, z: 0 } });
  run(c, w, cmd(), 0.1);
  stepCharacter(c, cmd({ jump: true }), w, TICK_DT);
  assert.equal(c.onGround, false);
  let peak = 0;
  for (let i = 0; i < 120; i++) {
    stepCharacter(c, cmd(), w, TICK_DT);
    peak = Math.max(peak, c.pos.y);
  }
  assert.ok(peak > 1.0 && peak < 1.6, `peak ${peak}`);
  assert.equal(c.onGround, true);
});

test('sprinting is faster than walking, aiming is slower', () => {
  const dist = (o) => {
    const w = flatWorld();
    const c = createCharacter({ id: 1, name: 'a', pos: { x: 0, y: 0, z: 0 } });
    run(c, w, cmd(), 0.1);
    run(c, w, cmd({ moveZ: 1, ...o }), 2);
    return -c.pos.z;
  };
  const walk = dist({});
  assert.ok(dist({ sprint: true }) > walk * 1.3);
  assert.ok(dist({ aim: true }) < walk * 0.8);
});

test('characters cannot leave the map', () => {
  const w = flatWorld();
  const c = createCharacter({ id: 1, name: 'a', pos: { x: 0, y: 0, z: 0 } });
  run(c, w, cmd({ moveZ: 1, sprint: true }), 15);
  assert.ok(c.pos.z >= -50 + PLAYER.radius - 1e-9);
});

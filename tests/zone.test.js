import test from 'node:test';
import assert from 'node:assert/strict';
import { createTerrain } from '../js/sim/terrain.js';
import { createWorld } from '../js/sim/world.js';
import { createCharacter } from '../js/sim/character.js';
import { createRng } from '../js/sim/rng.js';
import { createZone, tickZone, isInside } from '../js/sim/zone.js';
import { ZONE, TICK_DT } from '../js/config.js';

const SIZE = 1200;
const terrain = createTerrain({ size: SIZE, cellSize: 4, heightFn: () => 5 });
const make = (seed = 1) => createZone({ size: SIZE, terrain, rng: createRng(seed) });
const run = (zone, seconds, chars = [], events = []) => {
  for (let i = 0; i < Math.round(seconds / TICK_DT); i++) tickZone(zone, TICK_DT, chars, events);
  return events;
};

test('the storm starts out covering the whole map, with the first safe circle inside it', () => {
  const z = make();
  assert.equal(z.phase, 0);
  assert.equal(z.stage, 'wait');
  assert.ok(z.current.r >= (SIZE / 2) * Math.SQRT2, 'covers the corners');
  assert.equal(z.target.r, ZONE.phases[0].radius);
  const d = Math.hypot(z.target.x - z.current.x, z.target.z - z.current.z);
  assert.ok(d + z.target.r <= z.current.r + 1e-6);
});

test('it waits, then shrinks smoothly to the target circle', () => {
  const z = make();
  const start = { ...z.current };
  run(z, ZONE.phases[0].wait - 1);
  assert.equal(z.stage, 'wait');
  assert.ok(Math.abs(z.current.r - start.r) < 1e-9);
  run(z, 1 + ZONE.phases[0].shrink / 2);
  assert.equal(z.stage, 'shrink');
  assert.ok(z.current.r < start.r && z.current.r > ZONE.phases[0].radius);
  run(z, ZONE.phases[0].shrink / 2 + 0.1);
  assert.equal(z.phase, 1, 'on to the next phase');
  assert.ok(Math.abs(z.current.r - ZONE.phases[0].radius) < 1e-6);
});

test('every next circle lies inside the previous one, and the last one closes completely', () => {
  const z = make(7);
  let prev = { ...z.target };
  const total = ZONE.phases.reduce((t, p) => t + p.wait + p.shrink, 0);
  for (let t = 0; t < total + 5; t += 1) {
    run(z, 1);
    if (z.target.r !== prev.r) {
      const d = Math.hypot(z.target.x - prev.x, z.target.z - prev.z);
      assert.ok(d + z.target.r <= prev.r + 1e-6, 'next circle inside the previous one');
      prev = { ...z.target };
    }
  }
  assert.equal(z.stage, 'done');
  assert.ok(z.current.r < 1e-6);
});

test('outside the storm you lose health every second, ignoring shield; inside you are safe', () => {
  const world = createWorld(terrain);
  const z = make();
  z.current = { x: 0, z: 0, r: 50 };
  const out = createCharacter({ id: 1, name: 'out', pos: { x: 100, y: 5, z: 0 } });
  const safe = createCharacter({ id: 2, name: 'in', pos: { x: 10, y: 5, z: 0 } });
  out.shield = 100;
  world.characters.set(1, out);
  world.characters.set(2, safe);
  const events = run(z, 3.05, [out, safe]);
  assert.equal(out.shield, 100);
  assert.equal(out.health, 100 - 3 * ZONE.phases[0].dps);
  assert.equal(safe.health, 100);
  assert.ok(events.every((e) => e.type !== 'hit' || e.targetId === 1));
});

test('the storm can eliminate you, and the kill is credited to the storm', () => {
  const z = make();
  z.current = { x: 0, z: 0, r: 10 };
  const c = createCharacter({ id: 1, name: 'out', pos: { x: 100, y: 5, z: 0 } });
  c.health = 1;
  const events = run(z, 1.05, [c]);
  assert.equal(c.alive, false);
  const kill = events.find((e) => e.type === 'kill');
  assert.equal(kill.killerId, null);
  assert.equal(kill.weapon, 'zone');
});

test('isInside checks against the current circle with an optional margin', () => {
  const circle = { x: 0, z: 0, r: 10 };
  assert.equal(isInside(circle, 9, 0), true);
  assert.equal(isInside(circle, 11, 0), false);
  assert.equal(isInside(circle, 9, 0, 2), false);
});

test('smaller maps get proportionally smaller circles', () => {
  const small = createZone({ size: 720, terrain: createTerrain({ size: 720, cellSize: 4, heightFn: () => 5 }), rng: createRng(2) });
  assert.ok(Math.abs(small.target.r - ZONE.phases[0].radius * (720 / ZONE.baseSize)) < 1e-9);
});

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

/** A chest-high ledge (face at z = -1) with the character already walked up against it. */
function atLedge(height = 1.5) {
  const w = flatWorld();
  w.addBox(box(-2, 0, -12, 2, height, -1)); // deep, so we don't walk off its back
  const c = spawn(w, 0, 0, 0);
  run(c, w, cmd({ moveZ: 1 }), 0.5);
  return { w, c };
}

/** Press jump on tick 0, release, then press again on tick `again`. */
const jumpThenPress = (again, o = {}) => (i) => cmd({ moveZ: 1, jump: i === 0 || i === again, ...o });

test('pressing jump at a chest-high ledge jumps instead of mantling', () => {
  const { w, c } = atLedge();
  let mantled = false;
  run(c, w, (i) => {
    if (c.mantle) mantled = true;
    return cmd({ moveZ: 1, jump: i === 0 });
  }, 1.0);
  assert.equal(mantled, false, 'a single press must not mantle');
  assert.ok(c.pos.y < 0.01 && c.pos.z > -1, `should be back on the ground in front: y=${c.pos.y} z=${c.pos.z}`);
});

test('pressing jump again in mid-air mantles onto the ledge', () => {
  // Early in the jump, at the top of it, and on the way down.
  for (const again of [8, 20, 32]) {
    const { w, c } = atLedge();
    run(c, w, jumpThenPress(again), 1.2);
    assert.ok(Math.abs(c.pos.y - 1.5) < 0.01, `second press on tick ${again}: y=${c.pos.y}`);
    assert.ok(c.pos.z < -1, `second press on tick ${again}: should be standing on the ledge`);
  }
});

test('holding jump does not mantle', () => {
  const { w, c } = atLedge();
  let mantled = false;
  run(c, w, () => {
    if (c.mantle) mantled = true;
    return cmd({ moveZ: 1, jump: true });
  }, 1.5);
  assert.equal(mantled, false);
  assert.ok(c.pos.z > -1, 'should still be in front of the ledge');
});

test('a crouched character mantles with a single press (it cannot jump)', () => {
  const { w, c } = atLedge();
  run(c, w, (i) => cmd({ moveZ: 1, crouch: true, jump: i === 0 }), 1.0);
  assert.ok(Math.abs(c.pos.y - 1.5) < 0.01, `y=${c.pos.y}`);
  assert.ok(c.pos.z < -1);
});

test('a storey-high wall cannot be mantled, even from the top of a jump', () => {
  const { w, c } = atLedge(4);
  let mantled = false;
  run(c, w, (i) => {
    if (c.mantle) mantled = true;
    return jumpThenPress(20)(i);
  }, 1.5);
  assert.equal(mantled, false);
  assert.ok(c.pos.y < 0.01);
});

test('no mantle when there is no headroom on top of the ledge', () => {
  const { w, c } = atLedge();
  // A thick ceiling 0.7 m above the ledge, starting just past its edge (so there is no slab top to grab instead).
  w.addBox(box(-2, 2.2, -4, 2, 6, -1.6));
  run(c, w, jumpThenPress(12), 1.0);
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

// ---------- Chained hops (players only) ----------
const openWorld = (size = 400) => createWorld(createTerrain({ size, cellSize: 4, heightFn: () => 0 }));
function spawnKind(w, kind) {
  const c = createCharacter({ id: 1, name: 'a', kind, pos: { x: 0, y: 0, z: 0 } });
  run(c, w, cmd(), 0.2);
  return c;
}
/** Put the character in the air, `speed` m/s toward −Z (yaw 0 looks that way). */
function launch(c, speed) {
  c.vel.x = 0;
  c.vel.z = -speed;
  c.vel.y = PLAYER.jumpSpeed;
  c.pos.y += 0.01;
  c.onGround = false;
  c.airTime = PLAYER.coyoteTime;
}
/** Run with a command and return the horizontal speed on every tick a jump starts. */
function hopSpeeds(c, w, command, seconds) {
  const speeds = [];
  const n = Math.round(seconds / TICK_DT);
  for (let i = 0; i < n; i++) {
    const wasGround = c.onGround || c.airTime < PLAYER.coyoteTime;
    const vyBefore = c.vel.y;
    stepCharacter(c, typeof command === 'function' ? command(i) : command, w, TICK_DT, []);
    if (wasGround && vyBefore <= 0 && c.vel.y > PLAYER.jumpSpeed * 0.9) speeds.push(c.speed);
  }
  return speeds;
}
const sprintHop = cmd({ moveZ: 1, sprint: true, jump: true });

test('a player holding jump through landings gets 1.05x faster with every hop', () => {
  const w = openWorld();
  const c = spawnKind(w, 'player');
  run(c, w, cmd({ moveZ: 1, sprint: true }), 1);
  const speeds = hopSpeeds(c, w, sprintHop, 3.5);
  assert.ok(speeds.length >= 4, `hops: ${speeds.length}`);
  assert.ok(Math.abs(speeds[0] - PLAYER.sprintSpeed) < 0.05, `first hop at sprint speed: ${speeds[0]}`);
  for (let i = 1; i < 4; i++) {
    const ratio = speeds[i] / speeds[i - 1];
    assert.ok(Math.abs(ratio - 1.05) < 0.005, `hop ${i + 1}: ${ratio.toFixed(3)}x`);
  }
});

test('chained hops have no top speed', () => {
  const w = openWorld(1400);
  const c = spawnKind(w, 'player');
  run(c, w, cmd({ moveZ: 1, sprint: true }), 1);
  const speeds = hopSpeeds(c, w, sprintHop, 24);
  assert.ok(speeds.at(-1) > 30, `only ${speeds.at(-1).toFixed(1)} m/s after ${speeds.length} hops`);
  assert.ok(speeds.at(-1) > speeds.at(-2), 'still speeding up');
});

test('letting go of W while hopping does not slow you down', () => {
  const w = openWorld();
  const c = spawnKind(w, 'player');
  run(c, w, cmd({ moveZ: 1 }), 1);
  run(c, w, cmd({ moveZ: 1, jump: true }), 1);
  const before = c.speed;
  run(c, w, cmd({ jump: true }), 3);
  assert.ok(c.speed >= before - 1e-6, `${before.toFixed(2)} → ${c.speed.toFixed(2)}`);
});

test('letting go of jump ends the chain and the speed drops back', () => {
  const w = openWorld();
  const c = spawnKind(w, 'player');
  run(c, w, cmd({ moveZ: 1, sprint: true }), 1);
  hopSpeeds(c, w, sprintHop, 4);
  assert.ok(c.speed > PLAYER.sprintSpeed * 1.15, `boosted to ${c.speed}`);
  run(c, w, cmd({ moveZ: 1, sprint: true }), 1.5);
  assert.ok(c.onGround);
  assert.ok(c.speed <= PLAYER.sprintSpeed + 1e-6, `still at ${c.speed}`);
});

test('bots holding jump never speed up', () => {
  const w = openWorld();
  const c = spawnKind(w, 'bot');
  run(c, w, cmd({ moveZ: 1, sprint: true }), 1);
  const speeds = hopSpeeds(c, w, sprintHop, 3.5);
  assert.ok(speeds.length >= 4);
  for (const s of speeds) assert.ok(s <= PLAYER.sprintSpeed + 1e-6, `bot hop at ${s}`);
});

test('running into a wall mid-chain stops the boosted speed', () => {
  const w = openWorld();
  const c = spawnKind(w, 'player');
  run(c, w, cmd({ moveZ: 1, sprint: true }), 1);
  hopSpeeds(c, w, sprintHop, 4);
  const z = c.pos.z;
  w.addBox(box(-10, -1, z - 6, 10, 10, z - 5)); // a tall wall straight ahead
  run(c, w, sprintHop, 2);
  assert.ok(c.pos.z > z - 5, 'did not pass through the wall');
  assert.ok(c.speed < PLAYER.walkSpeed, `still moving at ${c.speed}`);
});

test('even a very fast player cannot pass through a thin wall', () => {
  const w = openWorld();
  w.addBox(box(-10, -1, -6, 10, 10, -6 + 0.25)); // a 0.25 m wall 6 m ahead
  const c = spawnKind(w, 'player');
  launch(c, 90); // 1.5 m per tick
  run(c, w, cmd({ jump: true }), 1);
  assert.ok(c.pos.z > -6 + 0.25, `went through to z ${c.pos.z.toFixed(2)}`);
  assert.ok(c.speed < 1, `still moving at ${c.speed}`);
});

/** Build a chain heading −Z, then hop on with `command(i)`; returns speed and heading afterwards. */
function steerAfterChain(command, seconds) {
  const w = openWorld(600);
  const c = spawnKind(w, 'player');
  run(c, w, cmd({ moveZ: 1, sprint: true }), 1);
  hopSpeeds(c, w, sprintHop, 3);
  const before = c.speed;
  const speeds = hopSpeeds(c, w, command, seconds);
  return { c, before, speeds, heading: Math.atan2(c.vel.x, -c.vel.z) }; // 0 = −Z, +π/2 = +X
}
const deg = (r) => (r * 180) / Math.PI;

test('turning the camera 90° mid-chain turns the hop without losing speed', () => {
  // yaw −π/2 looks toward +X
  const { c, before, speeds, heading } = steerAfterChain(cmd({ moveZ: 1, sprint: true, jump: true, yaw: -Math.PI / 2 }), 0.8);
  assert.ok(Math.abs(deg(heading) - 90) < 3, `heading ${deg(heading).toFixed(1)}°`);
  assert.ok(c.speed >= before - 1e-6, `slowed from ${before.toFixed(2)} to ${c.speed.toFixed(2)}`);
  assert.ok(speeds.length >= 1 && speeds.at(-1) > before, 'and it keeps speeding up');
});

test('turning all the way around mid-chain keeps the speed', () => {
  const { c, before, heading } = steerAfterChain(cmd({ moveZ: 1, sprint: true, jump: true, yaw: Math.PI }), 1.2);
  assert.ok(Math.abs(Math.abs(deg(heading)) - 180) < 3, `heading ${deg(heading).toFixed(1)}°`);
  assert.ok(c.speed >= before - 1e-6, `slowed from ${before.toFixed(2)} to ${c.speed.toFixed(2)}`);
});

test('strafing alone curves a chained hop without slowing it', () => {
  const { c, before, heading } = steerAfterChain(cmd({ moveX: 1, jump: true }), 0.15);
  assert.ok(deg(heading) > 20, `curved only ${deg(heading).toFixed(1)}°`);
  assert.ok(c.speed >= before - 1e-6, `slowed from ${before.toFixed(2)} to ${c.speed.toFixed(2)}`);
});

test('with no keys but jump, a chained hop coasts straight on', () => {
  const { c, before, heading } = steerAfterChain(cmd({ jump: true }), 0.6);
  assert.ok(Math.abs(deg(heading)) < 1, `drifted ${deg(heading).toFixed(1)}°`);
  assert.ok(c.speed >= before - 1e-6);
});

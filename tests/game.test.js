import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../js/sim/game.js';
import { shotOrigin } from '../js/sim/weapons.js';
import { TICK_DT, DUMMY } from '../js/config.js';

const idle = (o = {}) => ({
  moveX: 0, moveZ: 0, yaw: 0, pitch: 0, jump: false, sprint: false, fire: false, aim: false, reload: false, ...o,
});

// Put the player 10 m west of a standing dummy and return a command that aims at its chest.
function lineUp(game) {
  const { player, world } = game;
  const dummy = game.dummies.find((d) => d.dummy.mode === 'stand');
  player.pos.x = dummy.pos.x - 10;
  player.pos.z = dummy.pos.z;
  player.pos.y = world.terrain.heightAt(player.pos.x, player.pos.z);
  let yaw = -Math.PI / 2;
  let pitch = 0;
  for (let i = 0; i < 3; i++) {
    player.yaw = yaw;
    const o = shotOrigin(player, world);
    const dx = dummy.pos.x - o.x;
    const dy = dummy.pos.y + 1.0 - o.y;
    const dz = dummy.pos.z - o.z;
    yaw = Math.atan2(-dx, -dz);
    pitch = Math.atan2(dy, Math.hypot(dx, dz));
  }
  return { dummy, aim: { yaw, pitch } };
}

test('the game has a player with a rifle and several dummies', () => {
  const game = createGame({ seed: 7 });
  assert.equal(game.player.weapon.type, 'ar');
  assert.ok(game.player.ammo.medium > 0);
  assert.ok(game.dummies.length >= 6);
  assert.ok(game.world.boxes.size > 50, 'map should have buildings, trees and rocks');
});

test('shooting a dummy straight ahead hits it and removes shield before health', () => {
  const game = createGame({ seed: 7 });
  const { dummy, aim } = lineUp(game);
  dummy.shield = 50;
  game.tick(idle({ ...aim, aim: true }));
  game.events.length = 0;
  game.tick(idle({ ...aim, aim: true, fire: true }));
  const hit = game.events.find((e) => e.type === 'hit');
  assert.ok(hit, 'expected a hit event');
  assert.equal(hit.targetId, dummy.id);
  assert.equal(dummy.shield, 18);
  assert.equal(dummy.health, 100);
});

test('killing a dummy emits a kill event and it respawns after the respawn time', () => {
  const game = createGame({ seed: 7 });
  const { dummy, aim } = lineUp(game);
  dummy.shield = 0;
  dummy.health = 10;
  game.tick(idle({ ...aim, aim: true }));
  game.events.length = 0;
  game.tick(idle({ ...aim, aim: true, fire: true }));
  assert.ok(game.events.some((e) => e.type === 'kill' && e.victimId === dummy.id));
  assert.equal(dummy.alive, false);
  assert.equal(game.player.stats.kills, 1);
  const n = Math.round((DUMMY.respawnTime + 0.1) / TICK_DT);
  for (let i = 0; i < n; i++) game.tick(idle());
  assert.equal(dummy.alive, true);
  assert.equal(dummy.health, 100);
});

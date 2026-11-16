import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, emptyCommand } from '../js/sim/game.js';
import { dealDamage } from '../js/sim/damage.js';
import { TICK_DT } from '../js/config.js';

const idle = emptyCommand();

test('a 25-player match spawns everyone unarmed on land', () => {
  const game = createGame({ mode: 'match', players: 25, seed: 3 });
  assert.equal(game.alive, 25);
  assert.equal(game.bots.length, 24);
  for (const c of game.world.characters.values()) {
    assert.ok(c.inventory.slots.every((s) => s === null));
    assert.ok(c.pos.y > 0.5);
  }
});

test('bots loot and fight: chests get opened and players get eliminated', () => {
  const game = createGame({ mode: 'match', players: 25, seed: 3 });
  const t0 = performance.now();
  const seconds = 150;
  for (let i = 0; i < seconds / TICK_DT; i++) {
    game.tick(idle);
    game.events.length = 0;
  }
  const msPerTick = (performance.now() - t0) / (seconds / TICK_DT);
  const opened = game.world.loot.chests.filter((c) => c.opened).length;
  const aliveBots = game.bots.filter((b) => b.alive);
  const armedBots = aliveBots.filter((b) => b.inventory.slots.some((s) => s && s.kind === 'weapon')).length;
  assert.ok(opened >= 15, `only ${opened} chests opened`);
  assert.ok(armedBots >= aliveBots.length * 0.6, `only ${armedBots} of ${aliveBots.length} surviving bots armed`);
  assert.ok(game.alive < 25, 'some fights should have happened');
  assert.ok(msPerTick < 4, `sim too slow: ${msPerTick.toFixed(2)} ms per tick`);
});

test('the player getting eliminated produces a placement result', () => {
  const game = createGame({ mode: 'match', players: 25, seed: 5 });
  const killer = game.bots[0];
  const events = game.events;
  dealDamage(killer, game.player, 500, { weapon: 'ar' }, events);
  game.tick(idle);
  assert.equal(game.state, 'eliminated');
  assert.equal(game.result.placement, 25);
  assert.equal(game.result.killer, killer.name);
  assert.ok(game.world.loot.items.size > 0);
});

test('being the last one standing wins the match', () => {
  const game = createGame({ mode: 'match', players: 25, seed: 6 });
  for (const b of game.bots) dealDamage(game.player, b, 500, { weapon: 'ar' }, game.events);
  game.tick(idle);
  assert.equal(game.state, 'won');
  assert.equal(game.result.placement, 1);
  assert.equal(game.result.kills, 24);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createTerrain } from '../js/sim/terrain.js';
import { createWorld } from '../js/sim/world.js';
import { createCharacter, stepCharacter } from '../js/sim/character.js';
import { createWeapon, tickWeapon } from '../js/sim/weapons.js';
import { addItem, tickInventory, consumableItem } from '../js/sim/inventory.js';
import { addChest, tickInteract, tickLoot } from '../js/sim/loot.js';
import { tickProjectiles } from '../js/sim/projectiles.js';
import { buildNavGrid } from '../js/sim/navgrid.js';
import { createBrain, botCommand } from '../js/sim/bots.js';
import { createRng } from '../js/sim/rng.js';
import { TICK_DT } from '../js/config.js';

const idle = {
  moveX: 0, moveZ: 0, yaw: 0, pitch: 0, jump: false, sprint: false, crouch: false, fire: false, aim: false,
  reload: false, interact: false, drop: false, slot: -1, slotDelta: 0,
};

/** A tiny stand-in for the game: flat ground, optional extra boxes. */
function arena(boxes = []) {
  const world = createWorld(createTerrain({ size: 200, cellSize: 2, heightFn: () => 0 }));
  for (const b of boxes) world.addBox(b);
  const game = {
    world, nav: null, bots: [], noises: [], time: 0, tickCount: 0, pathBudget: 3, alive: 2,
    map: { places: [], half: 100 }, rng: createRng(5),
  };
  return game;
}

function addBot(game, x, z, yaw = 0, difficulty = 'normal') {
  const bot = createCharacter({ id: game.world.characters.size + 1, name: 'bot', kind: 'bot', pos: { x, y: 0, z }, yaw });
  bot.onGround = true;
  createBrain(bot, difficulty, createRng(bot.id * 13));
  game.world.characters.set(bot.id, bot);
  game.bots.push(bot);
  return bot;
}

function addTarget(game, x, z) {
  const t = createCharacter({ id: game.world.characters.size + 1, name: 'target', kind: 'dummy', pos: { x, y: 0, z } });
  t.onGround = true;
  game.world.characters.set(t.id, t);
  return t;
}

function run(game, seconds) {
  if (!game.nav) game.nav = buildNavGrid(game.world);
  const rng = createRng(1);
  for (let i = 0; i < Math.round(seconds / TICK_DT); i++) {
    game.time += TICK_DT;
    game.tickCount++;
    game.pathBudget = 3;
    for (const c of game.world.characters.values()) {
      if (!c.alive) continue;
      const cmd = c.kind === 'bot' ? botCommand(c, game, TICK_DT) : idle;
      stepCharacter(c, cmd, game.world, TICK_DT, []);
      tickInventory(c, cmd, game.world, TICK_DT, []);
      tickInteract(c, cmd, game.world, TICK_DT, rng, []);
      tickWeapon(c, cmd, game.world, TICK_DT, rng, []);
    }
    tickProjectiles(game.world, TICK_DT, []);
    tickLoot(game.world, TICK_DT);
  }
}

test('an armed bot that sees an enemy shoots it', () => {
  const game = arena();
  const bot = addBot(game, 0, 0, 0);
  addItem(bot, createWeapon('ar', 'rare'));
  bot.ammo.medium = 120;
  const target = addTarget(game, 3, -25);
  target.shield = 150;
  run(game, 6);
  assert.ok(target.health + target.shield < 250, `target untouched: ${target.health}+${target.shield}`);
});

test('an unarmed bot walks to a chest, opens it and arms itself', () => {
  const game = arena();
  const bot = addBot(game, 0, 0, Math.PI);
  const chest = addChest(game.world, { x: 15, y: 0, z: 20, yaw: 0 });
  run(game, 25);
  assert.equal(chest.opened, true, 'chest should be opened');
  assert.ok(bot.inventory.slots.some((s) => s && s.kind === 'weapon'), 'bot should have picked up the weapon');
});

test('a bot finds its way around a wall to a chest behind it', () => {
  const game = arena([{ minX: -15, minY: 0, minZ: -10.2, maxX: 15, maxY: 3, maxZ: -10 }]);
  addBot(game, 0, 0, 0);
  const chest = addChest(game.world, { x: 0, y: 0, z: -18, yaw: Math.PI });
  run(game, 30);
  assert.equal(chest.opened, true);
});

test('a bot with shield cells and no enemies tops up its shield', () => {
  const game = arena();
  const bot = addBot(game, 0, 0);
  addItem(bot, createWeapon('ar', 'common'));
  bot.ammo.medium = 60;
  addItem(bot, consumableItem('shieldSmall', 2));
  run(game, 6);
  assert.ok(bot.shield >= 50, `shield ${bot.shield}`);
});

test('a bot shot from behind turns around and fights back', () => {
  const game = arena();
  const bot = addBot(game, 0, 0, 0); // facing −Z
  addItem(bot, createWeapon('smg', 'common'));
  bot.ammo.light = 120;
  const attacker = addTarget(game, 0, 12); // behind (+Z)
  attacker.shield = 100;
  bot.ai.hurtBy = { id: attacker.id, time: 0 };
  run(game, 5);
  assert.ok(attacker.health + attacker.shield < 200);
});

test('a bot outside the next safe circle runs into it once the storm closes in', () => {
  const game = arena();
  const bot = addBot(game, -40, 0, 0);
  addItem(bot, createWeapon('ar', 'common'));
  bot.ammo.medium = 60;
  game.zone = { current: { x: 0, z: 0, r: 90 }, target: { x: 50, z: 0, r: 20 }, stage: 'shrink', timer: 30 };
  const before = Math.hypot(bot.pos.x - 50, bot.pos.z);
  run(game, 16); // ~85 m at a sprint
  const after = Math.hypot(bot.pos.x - 50, bot.pos.z);
  assert.ok(after < 20, `still outside the safe circle: ${after.toFixed(1)} m from its centre (was ${before})`);
});

test('a bot does not walk out of the safe circle to loot a chest in the storm', () => {
  const game = arena();
  addBot(game, 0, 0, 0);
  const outside = addChest(game.world, { x: 0, y: 0, z: -40, yaw: 0 });
  game.zone = { current: { x: 0, z: 0, r: 30 }, target: { x: 0, z: 0, r: 25 }, stage: 'wait', timer: 60 };
  run(game, 12);
  assert.equal(outside.opened, false);
});

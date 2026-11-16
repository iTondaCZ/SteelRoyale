// The game simulation: steps every character at a fixed rate from per-tick commands.
// Rendering and UI only read this state and the `events` queue.
//   mode 'match':    island map, you + bots, last one standing wins
//   mode 'training': the step 1 firing range with dummies (and a few chests to try looting)
import { TICK_DT, DUMMY, MATCH, BOT_NAMES } from '../config.js';
import { createRng, pick } from './rng.js';
import { createCharacter, stepCharacter } from './character.js';
import { createWeapon, tickWeapon } from './weapons.js';
import { tickProjectiles } from './projectiles.js';
import { addItem, tickInventory, dropAll, consumableItem } from './inventory.js';
import { tickInteract, tickLoot, addChest } from './loot.js';
import { createTrainingMap } from './training-map.js';
import { generateMap, pickSpawnPoints } from './mapgen.js';
import { buildNavGrid } from './navgrid.js';
import { createBrain, botCommand } from './bots.js';
import { createZone, tickZone } from './zone.js';

export const emptyCommand = () => ({
  moveX: 0, moveZ: 0, yaw: 0, pitch: 0, jump: false, sprint: false, crouch: false, fire: false, aim: false,
  reload: false, interact: false, drop: false, slot: -1, slotDelta: 0,
});

export function createGame({ mode = 'training', seed = 7, players = 100, difficulty = 'normal', playerName = 'You' } = {}) {
  const rng = createRng((seed * 2654435761) >>> 0);
  let nextId = 1;
  const game = {
    mode,
    seed,
    difficulty,
    rng,
    map: null,
    world: null,
    nav: null,
    zone: null,
    player: null,
    bots: [],
    dummies: [],
    events: [],
    noises: [],
    time: 0,
    tickCount: 0,
    pathBudget: 0,
    alive: 0,
    totalPlayers: 0,
    state: 'playing', // 'playing' | 'eliminated' | 'won'
    result: null,
    winnerId: null,
    tick,
  };

  if (mode === 'match') {
    const size = MATCH.mapSize[players] || MATCH.mapSize[100];
    game.map = generateMap({ seed, size, players });
    game.world = game.map.world;
    game.nav = buildNavGrid(game.world);
    game.zone = createZone({ size, terrain: game.map.terrain, rng: createRng(seed + 5) });
    const spawns = pickSpawnPoints(game.map, players, createRng(seed + 99));
    game.player = createCharacter({ id: nextId++, name: playerName, kind: 'player', pos: spawns[0], yaw: spawns[0].yaw });
    game.world.characters.set(game.player.id, game.player);
    // Unique names: shuffled list first, then the same names with a number ("Rusty2").
    const names = [...BOT_NAMES];
    for (let i = names.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [names[i], names[j]] = [names[j], names[i]];
    }
    for (let i = 1; i < players; i++) {
      const k = i - 1;
      const name = k < names.length ? names[k] : `${names[k % names.length]}${Math.floor(k / names.length) + 1}`;
      const bot = createCharacter({ id: nextId++, name, kind: 'bot', pos: spawns[i], yaw: spawns[i].yaw });
      createBrain(bot, difficulty, createRng(seed * 31 + i));
      game.world.characters.set(bot.id, bot);
      game.bots.push(bot);
    }
    game.alive = players;
    game.totalPlayers = players;
  } else {
    setupTraining(game, seed, () => nextId++);
  }
  for (const c of game.world.characters.values()) c.onGround = true;

  function tick(cmd) {
    const { world, player } = game;
    game.time += TICK_DT;
    game.tickCount++;
    game.pathBudget = 2;

    for (const c of world.characters.values()) {
      c.prevPos.x = c.pos.x;
      c.prevPos.y = c.pos.y;
      c.prevPos.z = c.pos.z;
    }

    for (const c of world.characters.values()) {
      if (!c.alive) {
        if (c.kind === 'dummy' && c.respawnAt != null && game.time >= c.respawnAt) respawnDummy(game, c);
        continue;
      }
      let command;
      if (c === player) command = cmd;
      else if (c.kind === 'bot') command = botCommand(c, game, TICK_DT);
      else command = dummyCommand(c, game.time);
      stepCharacter(c, command, world, TICK_DT, game.events);
      if (!c.alive) continue; // fall damage
      tickInventory(c, command, world, TICK_DT, game.events);
      tickInteract(c, command, world, TICK_DT, rng, game.events);
      tickWeapon(c, command, world, TICK_DT, rng, game.events);
    }
    tickProjectiles(world, TICK_DT, game.events);
    tickLoot(world, TICK_DT);
    if (game.zone) tickZone(game.zone, TICK_DT, world.characters.values(), game.events);

    // React to everything that happened (the UI clears `events` after reading them).
    for (let i = 0; i < game.events.length; i++) {
      const e = game.events[i];
      if (e.handled) continue;
      e.handled = true;
      handleEvent(game, e);
    }
    while (game.noises.length && game.time - game.noises[0].time > 1.5) game.noises.shift();
  }

  return game;
}

function handleEvent(game, e) {
  const { world } = game;
  if (e.type === 'shot') {
    game.noises.push({ x: e.from.x, z: e.from.z, time: game.time, shooterId: e.shooterId });
  } else if (e.type === 'explosion') {
    game.noises.push({ x: e.point.x, z: e.point.z, time: game.time, shooterId: -1 });
  } else if (e.type === 'hit') {
    const target = world.characters.get(e.targetId);
    if (target && target.ai && e.attackerId != null) target.ai.hurtBy = { id: e.attackerId, time: game.time };
    if (target) target.lastHit = { attackerId: e.attackerId, time: game.time };
  } else if (e.type === 'kill') {
    const victim = world.characters.get(e.victimId);
    victim.diedAt = game.time;
    if (victim.kind === 'dummy') {
      victim.respawnAt = game.time + DUMMY.respawnTime;
      return;
    }
    if (game.mode !== 'match') return;
    dropAll(victim, world);
    game.alive--;
    if (victim === game.player) {
      const killer = e.killerId != null ? world.characters.get(e.killerId) : null;
      game.state = 'eliminated';
      game.result = {
        placement: game.alive + 1,
        of: game.totalPlayers,
        kills: victim.stats.kills,
        damage: Math.round(victim.stats.damageDealt),
        killer: killer ? killer.name : null,
        weapon: e.weapon,
        time: game.time,
      };
      game.events.push({ type: 'playerEliminated' });
    }
    if (game.alive === 1) {
      const winner = [...world.characters.values()].find((c) => c.alive && c.kind !== 'dummy');
      game.winnerId = winner ? winner.id : null;
      if (winner === game.player) {
        game.state = 'won';
        game.result = {
          placement: 1,
          of: game.totalPlayers,
          kills: winner.stats.kills,
          damage: Math.round(winner.stats.damageDealt),
          time: game.time,
        };
      }
      game.events.push({ type: 'matchOver', winnerId: game.winnerId });
    }
  }
}

// ---------- Training range ----------

function setupTraining(game, seed, newId) {
  const map = createTrainingMap(seed);
  game.map = map;
  game.world = map.world;
  const world = map.world;
  const player = createCharacter({ id: newId(), name: 'You', kind: 'player', pos: map.spawn, yaw: map.spawn.yaw });
  addItem(player, createWeapon('ar', 'common'));
  addItem(player, createWeapon('shotgun', 'rare'));
  addItem(player, createWeapon('sniper', 'epic'));
  addItem(player, createWeapon('rocket', 'legendary'));
  addItem(player, consumableItem('shieldSmall', 6));
  player.equipLeft = 0;
  Object.assign(player.ammo, { light: 120, medium: 150, heavy: 30, shells: 30, rockets: 6 });
  world.characters.set(player.id, player);
  game.player = player;

  // A few chests to try looting
  for (const [x, z] of [[40, -9], [40, 9], [44, -12]]) addChest(world, { x, y: world.terrain.heightAt(x, z), z, yaw: Math.PI / 2 });

  game.dummies = map.dummySpots.map((s, i) => {
    const d = createCharacter({ id: newId(), name: `Training Bot ${i + 1}`, kind: 'dummy', pos: s, yaw: s.yaw });
    d.shield = s.shield;
    d.ai = null;
    d.dummy = { mode: s.mode, phase: s.phase || 0, home: { x: s.x, y: s.y, z: s.z } };
    world.characters.set(d.id, d);
    return d;
  });
}

const dummyCmd = emptyCommand();
function dummyCommand(d, time) {
  dummyCmd.yaw = d.yaw;
  dummyCmd.moveX = d.dummy.mode === 'strafe' ? Math.sin(time * 1.2 + d.dummy.phase) : 0;
  return dummyCmd;
}

function respawnDummy(game, d) {
  const h = d.dummy.home;
  d.alive = true;
  d.health = 100;
  d.shield = pick(game.rng, DUMMY.shields);
  d.pos.x = d.prevPos.x = h.x;
  d.pos.y = d.prevPos.y = h.y;
  d.pos.z = d.prevPos.z = h.z;
  d.vel.x = d.vel.y = d.vel.z = 0;
  d.respawnAt = null;
  game.events.push({ type: 'respawn', id: d.id });
}

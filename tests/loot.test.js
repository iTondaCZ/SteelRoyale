import test from 'node:test';
import assert from 'node:assert/strict';
import { createTerrain } from '../js/sim/terrain.js';
import { createWorld } from '../js/sim/world.js';
import { createCharacter } from '../js/sim/character.js';
import { createRng } from '../js/sim/rng.js';
import {
  addChest, spawnLoot, tickLoot, tickInteract, updateFocus, rollWeapon, rollChestLoot,
} from '../js/sim/loot.js';
import { ammoItem, consumableItem } from '../js/sim/inventory.js';
import { createWeapon } from '../js/sim/weapons.js';
import { TICK_DT, LOOT, WEAPONS } from '../js/config.js';

const flatWorld = () => createWorld(createTerrain({ size: 100, cellSize: 2, heightFn: () => 0 }));
const cmd = (o = {}) => ({
  moveX: 0, moveZ: 0, yaw: 0, pitch: 0, jump: false, sprint: false, crouch: false, fire: false, aim: false,
  reload: false, interact: false, drop: false, slot: -1, slotDelta: 0, ...o,
});
const hero = (x = 0, z = 0, yaw = 0) => {
  const c = createCharacter({ id: 1, name: 'hero', pos: { x, y: 0, z }, yaw });
  c.onGround = true;
  return c;
};
const run = (c, w, command, seconds, rng = createRng(1), events = []) => {
  for (let i = 0; i < Math.round(seconds / TICK_DT); i++) {
    tickInteract(c, typeof command === 'function' ? command(i) : command, w, TICK_DT, rng, events);
    tickLoot(w, TICK_DT);
  }
  return events;
};

test('a single press of interact opens a chest and spills a weapon with its ammo', () => {
  const w = flatWorld();
  const chest = addChest(w, { x: 0, y: 0, z: -1.6, yaw: 0 });
  const c = hero();
  c.pitch = -0.4;
  const events = run(c, w, (i) => cmd({ interact: i === 0, pitch: -0.4 }), TICK_DT);
  assert.equal(chest.opened, true, 'opens on the press itself');
  run(c, w, cmd({ pitch: -0.4 }), 0.5, createRng(1), events);
  assert.ok(events.some((e) => e.type === 'chestOpened'));
  const items = [...w.loot.items.values()].map((l) => l.item);
  const weapon = items.find((i) => i.kind === 'weapon');
  assert.ok(weapon, 'a chest always has a weapon');
  const ammoType = WEAPONS[weapon.type].ammo;
  // The ammo either lies on the ground or was already auto-picked up by the opener.
  assert.ok(items.some((i) => i.kind === 'ammo' && i.ammoType === ammoType) || c.ammo[ammoType] > 0);
});

test('holding interact from before does not open a chest you turn to (it takes a fresh press)', () => {
  const w = flatWorld();
  const chest = addChest(w, { x: 0, y: 0, z: -1.6, yaw: 0 });
  const c = hero(0, 0, Math.PI); // facing away (this harness doesn't run movement, so set yaw directly)
  c.pitch = -0.4;
  run(c, w, cmd({ interact: true }), 0.2); // holding E while facing away
  c.yaw = 0; // turn to the chest, still holding
  run(c, w, cmd({ interact: true }), 0.5);
  assert.equal(chest.opened, false);
  run(c, w, cmd(), TICK_DT); // release
  run(c, w, cmd({ interact: true }), TICK_DT); // fresh press
  assert.equal(chest.opened, true);
});

test('chests block movement like any box', () => {
  const w = flatWorld();
  addChest(w, { x: 0, y: 0, z: -3, yaw: 0 });
  assert.ok(w.raycast({ x: 0, y: 0.4, z: 0 }, { x: 0, y: 0, z: -1 }, 10, { ignoreTerrain: true }));
});

test('a vault always holds an Epic or Legendary weapon and a Big Shield', () => {
  const rng = createRng(5);
  for (let i = 0; i < 50; i++) {
    const items = rollChestLoot(rng, true);
    const weapon = items.find((x) => x.kind === 'weapon');
    assert.ok(['epic', 'legendary'].includes(weapon.rarity));
    assert.ok(items.some((x) => x.kind === 'consumable' && x.type === 'shieldBig'));
  }
});

test('rolled weapons only come in rarities that weapon allows', () => {
  const rng = createRng(9);
  for (let i = 0; i < 2000; i++) {
    const wpn = rollWeapon(rng, LOOT.chestRarity);
    assert.ok(WEAPONS[wpn.type].rarities.includes(wpn.rarity), `${wpn.rarity} ${wpn.type}`);
  }
});

test('walking over ammo picks it up automatically', () => {
  const w = flatWorld();
  spawnLoot(w, ammoItem('shells', 8), { x: 0, y: 0, z: -0.5 });
  const c = hero();
  run(c, w, cmd(), TICK_DT);
  assert.equal(c.ammo.shells, 8);
  assert.equal(w.loot.items.size, 0);
});

test('interact picks up the item you are looking at, not just the nearest one', () => {
  const w = flatWorld();
  spawnLoot(w, createWeapon('smg', 'common'), { x: -1.2, y: 0, z: 0 }); // left, closer
  const sniper = spawnLoot(w, createWeapon('sniper', 'rare'), { x: 0, y: 0, z: -1.8 }); // ahead
  const c = hero();
  c.pitch = -0.5;
  updateFocus(c, w);
  assert.equal(c.focus.kind, 'loot');
  assert.equal(c.focus.id, sniper.id);
  run(c, w, (i) => cmd({ interact: i === 0, pitch: -0.5 }), TICK_DT * 2);
  assert.equal(c.inventory.slots[0].type, 'sniper');
});

test('dropped loot falls to the ground and settles', () => {
  const w = flatWorld();
  const loot = spawnLoot(w, consumableItem('medkit', 1), { x: 0, y: 3, z: 0 }, { x: 1, y: 2, z: 0 });
  for (let i = 0; i < 120; i++) tickLoot(w, TICK_DT);
  assert.ok(Math.abs(loot.pos.y) < 1e-6);
  assert.equal(loot.settled, true);
});

test('ammo you drop yourself is not auto-picked back up (E still picks it up)', async () => {
  const { applyInventoryOp } = await import('../js/sim/inventory.js');
  const w = flatWorld();
  const c = hero();
  c.ammo.shells = 20;
  applyInventoryOp(c, w, { type: 'dropAmmo', ammoType: 'shells' }, []);
  run(c, w, cmd(), 1.5); // stand still while it lands at our feet
  assert.equal(c.ammo.shells, 0, 'not walked back up');
  const dropped = [...w.loot.items.values()][0];
  const other = createCharacter({ id: 2, name: 'other', pos: { x: dropped.pos.x, y: dropped.pos.y, z: dropped.pos.z } });
  run(other, w, cmd(), TICK_DT);
  assert.equal(other.ammo.shells, 20, 'someone else still auto-picks it up');
});

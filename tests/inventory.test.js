import test from 'node:test';
import assert from 'node:assert/strict';
import { createTerrain } from '../js/sim/terrain.js';
import { createWorld } from '../js/sim/world.js';
import { createCharacter } from '../js/sim/character.js';
import { createWeapon } from '../js/sim/weapons.js';
import {
  addItem, selectSlot, consumableItem, ammoItem, tickInventory, dropSelected, dropAll, canUse, itemLabel,
} from '../js/sim/inventory.js';
import { spawnLoot } from '../js/sim/loot.js';
import { pickUpLoot } from '../js/sim/inventory.js';
import { TICK_DT, AMMO, CONSUMABLES } from '../js/config.js';

const flatWorld = () => createWorld(createTerrain({ size: 100, cellSize: 2, heightFn: () => 0 }));
const cmd = (o = {}) => ({
  moveX: 0, moveZ: 0, yaw: 0, pitch: 0, jump: false, sprint: false, crouch: false, fire: false, aim: false,
  reload: false, interact: false, drop: false, slot: -1, slotDelta: 0, ...o,
});
const hero = () => {
  const c = createCharacter({ id: 1, name: 'hero', pos: { x: 0, y: 0, z: 0 } });
  c.onGround = true;
  return c;
};
const tick = (c, w, command, seconds, events = []) => {
  for (let i = 0; i < Math.round(seconds / TICK_DT); i++) tickInventory(c, command, w, TICK_DT, events);
  return events;
};

test('weapons fill empty slots and selecting a slot equips it', () => {
  const c = hero();
  assert.equal(addItem(c, createWeapon('ar', 'rare')), null);
  assert.equal(addItem(c, createWeapon('shotgun', 'common')), null);
  assert.equal(c.inventory.slots[0].type, 'ar');
  assert.equal(c.inventory.slots[1].type, 'shotgun');
  assert.equal(c.weapon.type, 'ar');
  selectSlot(c, 1);
  assert.equal(c.weapon.type, 'shotgun');
  assert.ok(c.equipLeft > 0, 'switching takes a moment');
  selectSlot(c, 3);
  assert.equal(c.weapon, null);
});

test('consumables stack up to their limit and spill into a new slot', () => {
  const c = hero();
  addItem(c, consumableItem('bandage', 10));
  const left = addItem(c, consumableItem('bandage', 10));
  assert.equal(left, null);
  assert.equal(c.inventory.slots[0].count, CONSUMABLES.bandage.stack);
  assert.equal(c.inventory.slots[1].count, 20 - CONSUMABLES.bandage.stack);
});

test('ammo goes to the reserves up to the cap and the rest is left over', () => {
  const c = hero();
  c.ammo.heavy = AMMO.heavy.max - 2;
  const left = addItem(c, ammoItem('heavy', 6));
  assert.equal(c.ammo.heavy, AMMO.heavy.max);
  assert.equal(left.count, 4);
});

test('with full slots a pickup swaps with the selected slot and drops the old item there', () => {
  const w = flatWorld();
  const c = hero();
  ['pistol', 'smg', 'ar', 'shotgun', 'pistol'].forEach((t) => addItem(c, createWeapon(t, 'common')));
  selectSlot(c, 2);
  const loot = spawnLoot(w, createWeapon('sniper', 'epic'), { x: 1, y: 0, z: 0 });
  const events = [];
  pickUpLoot(c, w, loot.id, events);
  assert.equal(c.inventory.slots[2].type, 'sniper');
  assert.equal(c.weapon.type, 'sniper');
  const ground = [...w.loot.items.values()];
  assert.equal(ground.length, 1);
  assert.equal(ground[0].item.type, 'ar');
  assert.ok(Math.abs(ground[0].pos.x - 1) < 1e-9);
  assert.ok(events.some((e) => e.type === 'pickup'));
});

test('a partial ammo pickup leaves the rest on the ground', () => {
  const w = flatWorld();
  const c = hero();
  c.ammo.rockets = AMMO.rockets.max - 1;
  const loot = spawnLoot(w, ammoItem('rockets', 3), { x: 0.5, y: 0, z: 0 });
  pickUpLoot(c, w, loot.id, []);
  assert.equal(c.ammo.rockets, AMMO.rockets.max);
  assert.equal(w.loot.items.get(loot.id).item.count, 2);
});

test('dropping the selected item puts it on the ground and empties the slot', () => {
  const w = flatWorld();
  const c = hero();
  addItem(c, createWeapon('ar', 'common'));
  tick(c, w, cmd({ drop: true }), TICK_DT);
  assert.equal(c.inventory.slots[0], null);
  assert.equal(c.weapon, null);
  assert.equal(w.loot.items.size, 1);
});

test('a bandage takes 3 s, heals 15 up to 75 and is used up', () => {
  const w = flatWorld();
  const c = hero();
  c.health = 50;
  addItem(c, consumableItem('bandage', 2));
  tick(c, w, cmd({ fire: true }), TICK_DT);
  assert.ok(c.useItem, 'use should start');
  assert.equal(c.useSpeedMul, 0.5);
  tick(c, w, cmd(), 2.5);
  assert.equal(c.health, 50);
  tick(c, w, cmd(), 0.6);
  assert.equal(c.health, 65);
  assert.equal(c.inventory.slots[0].count, 1);
  assert.equal(c.useItem, null);
  assert.equal(c.useSpeedMul, 1);
});

test('a big shield takes 5 s and gives 75 shield, capped at 150', () => {
  const w = flatWorld();
  const c = hero();
  addItem(c, consumableItem('shieldBig', 2));
  tick(c, w, cmd({ fire: true }), TICK_DT);
  tick(c, w, cmd(), 5.1);
  assert.equal(c.shield, 75);
  c.shield = 100;
  tick(c, w, cmd({ fire: true }), TICK_DT);
  tick(c, w, cmd(), 5.1);
  assert.equal(c.shield, 150);
});

test('a bandage is refused above 75 HP and a shield cell at full shield', () => {
  const c = hero();
  c.health = 80;
  assert.match(canUse(c, 'bandage'), /health/i);
  c.shield = 150;
  assert.match(canUse(c, 'shieldBig'), /shield/i);
  c.shield = 75;
  assert.match(canUse(c, 'shieldSmall'), /shield/i);
  assert.equal(canUse(c, 'shieldBig'), null);
});

test('switching slots cancels using an item', () => {
  const w = flatWorld();
  const c = hero();
  addItem(c, consumableItem('shieldBig', 1));
  addItem(c, createWeapon('ar', 'common'));
  tick(c, w, cmd({ fire: true }), 1);
  assert.ok(c.useItem);
  tick(c, w, cmd({ slot: 1 }), TICK_DT);
  assert.equal(c.useItem, null);
  tick(c, w, cmd(), 6);
  assert.equal(c.shield, 0);
  assert.equal(c.inventory.slots[0].count, 1);
});

test('the mouse wheel cycles through slots', () => {
  const w = flatWorld();
  const c = hero();
  tick(c, w, cmd({ slotDelta: 1 }), TICK_DT);
  assert.equal(c.inventory.selected, 1);
  tick(c, w, cmd({ slotDelta: -2 }), TICK_DT);
  assert.equal(c.inventory.selected, 4);
});

test('on elimination everything is dropped on the ground', () => {
  const w = flatWorld();
  const c = hero();
  addItem(c, createWeapon('ar', 'common'));
  addItem(c, consumableItem('medkit', 2));
  c.ammo.medium = 40;
  c.ammo.shells = 5;
  dropAll(c, w);
  const items = [...w.loot.items.values()].map((l) => l.item);
  assert.equal(items.length, 4);
  assert.ok(items.some((i) => i.kind === 'ammo' && i.ammoType === 'medium' && i.count === 40));
  assert.deepEqual(c.inventory.slots, [null, null, null, null, null]);
});

test('item labels read naturally', () => {
  assert.equal(itemLabel(createWeapon('shotgun', 'rare')), 'Rare Shotgun');
  assert.equal(itemLabel(consumableItem('bandage', 5)), 'Bandage ×5');
  assert.equal(itemLabel(ammoItem('medium', 30)), 'Medium Ammo ×30');
});

// ---------- Inventory menu actions (drag & drop) ----------
import { applyInventoryOp } from '../js/sim/inventory.js';

test('moving an item onto another slot swaps them and the selected slot re-equips', () => {
  const w = flatWorld();
  const c = hero();
  addItem(c, createWeapon('ar', 'rare'));
  addItem(c, createWeapon('shotgun', 'common'));
  c.equipLeft = 0;
  applyInventoryOp(c, w, { type: 'move', from: 0, to: 3 }, []);
  assert.equal(c.inventory.slots[0], null);
  assert.equal(c.inventory.slots[3].type, 'ar');
  assert.equal(c.inventory.selected, 0, 'the selected slot number stays');
  assert.equal(c.weapon, null, 'slot 1 is now empty, so nothing is equipped');
  applyInventoryOp(c, w, { type: 'move', from: 1, to: 0 }, []);
  assert.equal(c.weapon.type, 'shotgun', 'moving a weapon into the selected slot equips it');
});

test('dragging a consumable onto the same kind merges the stacks up to the limit', () => {
  const w = flatWorld();
  const c = hero();
  c.inventory.slots[0] = consumableItem('bandage', 10);
  c.inventory.slots[2] = consumableItem('bandage', 8);
  applyInventoryOp(c, w, { type: 'move', from: 2, to: 0 }, []);
  assert.equal(c.inventory.slots[0].count, CONSUMABLES.bandage.stack);
  assert.equal(c.inventory.slots[2].count, 18 - CONSUMABLES.bandage.stack);
  c.inventory.slots[3] = consumableItem('medkit', 1);
  c.inventory.slots[4] = consumableItem('medkit', 1);
  applyInventoryOp(c, w, { type: 'move', from: 4, to: 3 }, []);
  assert.equal(c.inventory.slots[3].count, 2);
  assert.equal(c.inventory.slots[4], null, 'an emptied stack frees its slot');
});

test('moving onto the same slot or an invalid slot does nothing', () => {
  const w = flatWorld();
  const c = hero();
  addItem(c, createWeapon('ar', 'common'));
  applyInventoryOp(c, w, { type: 'move', from: 0, to: 0 }, []);
  applyInventoryOp(c, w, { type: 'move', from: 0, to: 9 }, []);
  applyInventoryOp(c, w, { type: 'move', from: 2, to: 1 }, []);
  assert.equal(c.inventory.slots[0].type, 'ar');
  assert.equal(c.inventory.slots[1], null);
});

test('any slot can be dropped, not just the selected one', () => {
  const w = flatWorld();
  const c = hero();
  addItem(c, createWeapon('ar', 'common'));
  addItem(c, consumableItem('shieldBig', 2));
  const events = [];
  applyInventoryOp(c, w, { type: 'drop', slot: 1 }, events);
  assert.equal(c.inventory.slots[1], null);
  assert.equal(c.weapon.type, 'ar', 'the selected weapon stays in hand');
  const ground = [...w.loot.items.values()];
  assert.equal(ground.length, 1);
  assert.equal(ground[0].item.type, 'shieldBig');
  assert.ok(events.some((e) => e.type === 'drop'));
});

test('a whole ammo type can be dropped', () => {
  const w = flatWorld();
  const c = hero();
  c.ammo.shells = 23;
  applyInventoryOp(c, w, { type: 'dropAmmo', ammoType: 'shells' }, []);
  assert.equal(c.ammo.shells, 0);
  const ground = [...w.loot.items.values()];
  assert.equal(ground[0].item.kind, 'ammo');
  assert.equal(ground[0].item.count, 23);
  applyInventoryOp(c, w, { type: 'dropAmmo', ammoType: 'shells' }, []);
  assert.equal(w.loot.items.size, 1, 'nothing to drop when empty');
});

test('tickInventory applies queued menu actions in order', () => {
  const w = flatWorld();
  const c = hero();
  addItem(c, createWeapon('ar', 'common'));
  addItem(c, createWeapon('smg', 'common'));
  tickInventory(c, cmd({ invOps: [{ type: 'move', from: 0, to: 4 }, { type: 'drop', slot: 1 }] }), w, TICK_DT, []);
  assert.equal(c.inventory.slots[4].type, 'ar');
  assert.equal(c.inventory.slots[1], null);
  assert.equal(w.loot.items.size, 1);
});

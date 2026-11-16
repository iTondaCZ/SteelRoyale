// Inventory: 5 slots shared by weapons and consumables, ammo kept separately.
// Items: weapon instance (see weapons.js) | { kind: 'consumable', type, count } | { kind: 'ammo', ammoType, count }
import { WEAPONS, CONSUMABLES, AMMO, RARITY, PLAYER, EQUIP_TIME, INVENTORY } from '../config.js';
import { forwardXZ } from './vec.js';
import { spawnLoot, removeLoot } from './loot.js';

export const consumableItem = (type, count = CONSUMABLES[type].pile) => ({ kind: 'consumable', type, count });
export const ammoItem = (ammoType, count = AMMO[ammoType].pile) => ({ kind: 'ammo', ammoType, count });

export function createInventory() {
  return { slots: new Array(INVENTORY.slots).fill(null), selected: 0 };
}

export function itemLabel(item) {
  if (!item) return '';
  if (item.kind === 'weapon') return `${RARITY[item.rarity].name} ${WEAPONS[item.type].name}`;
  if (item.kind === 'consumable') return `${CONSUMABLES[item.type].name} ×${item.count}`;
  return `${AMMO[item.ammoType].name} ×${item.count}`;
}

function cancelActions(c) {
  if (c.weapon) c.weapon.reloadLeft = 0;
  c.useItem = null;
  c.useSpeedMul = 1;
}

/** Equip slot `index` (also call after the selected slot's content changes). */
export function selectSlot(c, index) {
  const inv = c.inventory;
  const changed = index !== inv.selected;
  if (changed) cancelActions(c);
  inv.selected = index;
  const item = inv.slots[index];
  const weapon = item && item.kind === 'weapon' ? item : null;
  if (weapon !== c.weapon) {
    c.weapon = weapon;
    c.equipLeft = weapon ? EQUIP_TIME : 0;
  }
}

/** Put an item into the inventory. Returns what didn't fit (the item itself, a smaller stack) or null. */
export function addItem(c, item) {
  const inv = c.inventory;
  if (item.kind === 'ammo') {
    const room = AMMO[item.ammoType].max - c.ammo[item.ammoType];
    const take = Math.min(room, item.count);
    c.ammo[item.ammoType] += take;
    if (take >= item.count) return null;
    return take > 0 ? { ...item, count: item.count - take } : item;
  }
  if (item.kind === 'consumable') {
    const max = CONSUMABLES[item.type].stack;
    let left = item.count;
    for (const s of inv.slots) {
      if (left <= 0) break;
      if (s && s.kind === 'consumable' && s.type === item.type && s.count < max) {
        const take = Math.min(max - s.count, left);
        s.count += take;
        left -= take;
      }
    }
    while (left > 0) {
      const i = firstEmptySlot(inv);
      if (i < 0) break;
      const take = Math.min(max, left);
      inv.slots[i] = { kind: 'consumable', type: item.type, count: take };
      left -= take;
    }
    if (left <= 0) return null;
    return left === item.count ? item : { ...item, count: left };
  }
  // weapon
  const i = firstEmptySlot(inv);
  if (i < 0) return item;
  inv.slots[i] = item;
  if (i === inv.selected) selectSlot(c, i);
  return null;
}

function firstEmptySlot(inv) {
  if (!inv.slots[inv.selected]) return inv.selected;
  return inv.slots.indexOf(null);
}

/** Pick up a loot item from the ground; with full slots it swaps with the selected slot. */
export function pickUpLoot(c, world, lootId, events) {
  const loot = world.loot.items.get(lootId);
  if (!loot) return false;
  const item = loot.item;
  const left = addItem(c, item);
  if (left === null) {
    removeLoot(world, loot);
  } else if (left !== item) {
    loot.item = left;
  } else if (item.kind === 'ammo') {
    return false; // ammo is full
  } else {
    const inv = c.inventory;
    const old = inv.slots[inv.selected];
    inv.slots[inv.selected] = item;
    removeLoot(world, loot);
    if (old) spawnLoot(world, old, { ...loot.pos });
    cancelActions(c);
    c.weapon = null;
    selectSlot(c, inv.selected);
  }
  events.push({ type: 'pickup', id: c.id, item: { ...item } });
  return true;
}

function dropVelocity(yaw, spread = 0) {
  const f = forwardXZ(yaw + spread);
  return { x: f.x * 2.2, y: 2.5, z: f.z * 2.2 };
}

function throwItem(c, world, item) {
  const f = forwardXZ(c.yaw);
  const loot = spawnLoot(world, item, { x: c.pos.x + f.x * 0.5, y: c.pos.y + 1.0, z: c.pos.z + f.z * 0.5 }, dropVelocity(c.yaw));
  loot.noAutoFor = c.id; // you dropped it on purpose: don't walk it straight back up
}

/** Drop the item in any slot. */
export function dropSlot(c, world, index, events) {
  const inv = c.inventory;
  const item = inv.slots[index];
  if (!item) return;
  inv.slots[index] = null;
  if (index === inv.selected) {
    cancelActions(c);
    selectSlot(c, index);
  }
  throwItem(c, world, item);
  events.push({ type: 'drop', id: c.id });
}

export const dropSelected = (c, world, events) => dropSlot(c, world, c.inventory.selected, events);

/** Drop all carried ammo of one type. */
export function dropAmmo(c, world, ammoType, events) {
  const count = c.ammo[ammoType] || 0;
  if (count <= 0) return;
  c.ammo[ammoType] = 0;
  throwItem(c, world, ammoItem(ammoType, count));
  events.push({ type: 'drop', id: c.id });
}

/**
 * Move the item in slot `from` onto slot `to`: merges matching consumable stacks,
 * otherwise swaps. The selected slot number stays the same and re-equips.
 */
export function moveSlot(c, from, to) {
  const inv = c.inventory;
  const n = inv.slots.length;
  if (from === to || from < 0 || to < 0 || from >= n || to >= n || !inv.slots[from]) return;
  const a = inv.slots[from];
  const b = inv.slots[to];
  if (b && a.kind === 'consumable' && b.kind === 'consumable' && a.type === b.type) {
    const room = CONSUMABLES[b.type].stack - b.count;
    const take = Math.min(room, a.count);
    b.count += take;
    a.count -= take;
    if (a.count <= 0) inv.slots[from] = null;
  } else {
    inv.slots[from] = b;
    inv.slots[to] = a;
  }
  if (from === inv.selected || to === inv.selected) {
    const before = c.weapon;
    selectSlot(c, inv.selected);
    if (c.weapon !== before) cancelActions(c);
    if (c.useItem && inv.slots[inv.selected] !== a && inv.slots[inv.selected] !== b) c.useItem = null;
  }
}

/**
 * One action from the inventory menu:
 * { type: 'move', from, to } | { type: 'drop', slot } | { type: 'dropAmmo', ammoType } | { type: 'select', slot }
 */
export function applyInventoryOp(c, world, op, events) {
  if (op.type === 'select') {
    if (op.slot >= 0 && op.slot < c.inventory.slots.length) selectSlot(c, op.slot);
  } else if (op.type === 'move') moveSlot(c, op.from, op.to);
  else if (op.type === 'drop') dropSlot(c, world, op.slot, events);
  else if (op.type === 'dropAmmo' && op.ammoType in c.ammo) dropAmmo(c, world, op.ammoType, events);
}

/** Spill every item and all ammo in a ring around the character (on elimination). */
export function dropAll(c, world) {
  const items = c.inventory.slots.filter(Boolean);
  for (const [type, count] of Object.entries(c.ammo)) if (count > 0) items.push(ammoItem(type, count));
  c.inventory.slots.fill(null);
  for (const k of Object.keys(c.ammo)) c.ammo[k] = 0;
  c.weapon = null;
  c.useItem = null;
  items.forEach((item, i) => {
    const a = (i / items.length) * Math.PI * 2;
    const r = 0.9;
    spawnLoot(
      world,
      item,
      { x: c.pos.x + Math.cos(a) * 0.2, y: c.pos.y + 1.0, z: c.pos.z + Math.sin(a) * 0.2 },
      { x: Math.cos(a) * r * 2, y: 2.5, z: Math.sin(a) * r * 2 },
    );
  });
}

/** Why a consumable can't be used right now, or null if it can. */
export function canUse(c, type) {
  const def = CONSUMABLES[type];
  if (def.health) {
    if (c.health >= PLAYER.maxHealth) return 'Health is full';
    if (c.health >= def.cap) return `Health is above ${def.cap}`;
  }
  if (def.shield) {
    if (c.shield >= PLAYER.maxShield) return 'Shield is full';
    if (c.shield >= def.cap) return `Shield is above ${def.cap}`;
  }
  return null;
}

function applyConsumable(c, type) {
  const def = CONSUMABLES[type];
  if (def.health) c.health = Math.min(def.cap, c.health + def.health);
  if (def.shield) c.shield = Math.min(def.cap, c.shield + def.shield);
}

/** Slot selection, dropping, and using consumables. */
export function tickInventory(c, cmd, world, dt, events) {
  if (!c.alive) return;
  const inv = c.inventory;
  const n = inv.slots.length;

  if (cmd.invOps) for (const op of cmd.invOps) applyInventoryOp(c, world, op, events);
  if (cmd.slot >= 0 && cmd.slot < n && cmd.slot !== inv.selected) selectSlot(c, cmd.slot);
  if (cmd.slotDelta) selectSlot(c, (((inv.selected + cmd.slotDelta) % n) + n) % n);
  if (cmd.drop) dropSelected(c, world, events);

  const item = inv.slots[inv.selected];
  const firePressed = cmd.fire && !c.lastUseFire;
  c.lastUseFire = !!cmd.fire;

  if (c.useItem) {
    if (!item || item.kind !== 'consumable' || item.type !== c.useItem.type || c.mantle) {
      c.useItem = null;
    } else {
      c.useItem.left -= dt;
      if (c.useItem.left <= 1e-9) {
        applyConsumable(c, item.type);
        item.count -= 1;
        if (item.count <= 0) inv.slots[inv.selected] = null;
        events.push({ type: 'itemUsed', id: c.id, item: item.type });
        c.useItem = null;
      }
    }
  } else if (item && item.kind === 'consumable' && cmd.fire && !c.mantle) {
    const reason = canUse(c, item.type);
    if (!reason) {
      const total = CONSUMABLES[item.type].useTime;
      c.useItem = { type: item.type, left: total, total };
      events.push({ type: 'itemUseStart', id: c.id, item: item.type });
    } else if (firePressed) {
      events.push({ type: 'useDenied', id: c.id, reason });
    }
  }
  c.useSpeedMul = c.useItem ? PLAYER.useItemSpeedMul : 1;
}

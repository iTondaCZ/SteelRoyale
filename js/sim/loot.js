// Ground loot, chests, loot tables, and the interact key (pick up / open).
import { LOOT, WEAPONS, AMMO, CONSUMABLES, RARITIES } from '../config.js';
import { forwardXZ, lookDir } from './vec.js';
import { createWeapon } from './weapons.js';
import { addItem, pickUpLoot, consumableItem, ammoItem } from './inventory.js';
import { eyeHeight } from './character.js';

const CELL = 8;
const key = (cx, cz) => (cx + 32768) * 65536 + (cz + 32768);

export function createLootSystem() {
  return { items: new Map(), cells: new Map(), chests: [], chestCells: new Map(), nextId: 1 };
}

const CHEST_CELL = 16;

export function chestsInRadius(world, x, z, r, out = []) {
  const cells = world.loot.chestCells;
  const x0 = Math.floor((x - r) / CHEST_CELL);
  const x1 = Math.floor((x + r) / CHEST_CELL);
  const z0 = Math.floor((z - r) / CHEST_CELL);
  const z1 = Math.floor((z + r) / CHEST_CELL);
  for (let cx = x0; cx <= x1; cx++) {
    for (let cz = z0; cz <= z1; cz++) {
      const list = cells.get(key(cx, cz));
      if (!list) continue;
      for (const ch of list) if ((ch.x - x) ** 2 + (ch.z - z) ** 2 <= r * r) out.push(ch);
    }
  }
  return out;
}

function cellAdd(sys, loot) {
  const k = key(Math.floor(loot.pos.x / CELL), Math.floor(loot.pos.z / CELL));
  loot.cell = k;
  let set = sys.cells.get(k);
  if (!set) sys.cells.set(k, (set = new Set()));
  set.add(loot);
}

function cellRemove(sys, loot) {
  const set = sys.cells.get(loot.cell);
  if (set) {
    set.delete(loot);
    if (set.size === 0) sys.cells.delete(loot.cell);
  }
}

export function spawnLoot(world, item, pos, vel = null) {
  const sys = world.loot;
  const loot = {
    id: sys.nextId++,
    item,
    pos: { x: pos.x, y: pos.y, z: pos.z },
    vel: vel ? { ...vel } : { x: 0, y: 0, z: 0 },
    settled: false,
    spin: (sys.nextId * 1.7) % (Math.PI * 2),
  };
  sys.items.set(loot.id, loot);
  cellAdd(sys, loot);
  return loot;
}

export function removeLoot(world, loot) {
  world.loot.items.delete(loot.id);
  cellRemove(world.loot, loot);
}

export function lootInRadius(world, x, z, r, out = []) {
  const sys = world.loot;
  const x0 = Math.floor((x - r) / CELL);
  const x1 = Math.floor((x + r) / CELL);
  const z0 = Math.floor((z - r) / CELL);
  const z1 = Math.floor((z + r) / CELL);
  for (let cx = x0; cx <= x1; cx++) {
    for (let cz = z0; cz <= z1; cz++) {
      const set = sys.cells.get(key(cx, cz));
      if (!set) continue;
      for (const l of set) if ((l.pos.x - x) ** 2 + (l.pos.z - z) ** 2 <= r * r) out.push(l);
    }
  }
  return out;
}

/** Highest surface at (x, z) at or below y (terrain or a box top). */
function groundBelow(world, x, z, y) {
  let g = world.terrain.heightAt(x, z);
  for (const b of world.grid.query(x - 0.05, z - 0.05, x + 0.05, z + 0.05)) {
    if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) continue;
    if (b.maxY <= y + 0.05 && b.maxY > g) g = b.maxY;
  }
  return g;
}

/** Simple physics for loot that was thrown (drops, chest spills). */
export function tickLoot(world, dt) {
  const sys = world.loot;
  for (const loot of sys.items.values()) {
    if (loot.settled) continue;
    const before = loot.pos.y;
    loot.vel.y -= 18 * dt;
    loot.pos.x += loot.vel.x * dt;
    loot.pos.z += loot.vel.z * dt;
    loot.pos.y += loot.vel.y * dt;
    const g = groundBelow(world, loot.pos.x, loot.pos.z, Math.max(before, loot.pos.y));
    if (loot.pos.y <= g) {
      loot.pos.y = g;
      loot.vel.x = loot.vel.y = loot.vel.z = 0;
      loot.settled = true;
    }
    const k = key(Math.floor(loot.pos.x / CELL), Math.floor(loot.pos.z / CELL));
    if (k !== loot.cell) {
      cellRemove(sys, loot);
      cellAdd(sys, loot);
    }
  }
}

// ---------- Chests ----------

export const CHEST_SIZE = { w: 1.1, h: 0.75, d: 0.65 };

/** Add a chest facing `yaw` (its front points along forwardXZ(yaw + π), i.e. toward whoever looks at it). */
export function addChest(world, { x, y, z, yaw = 0, vault = false }) {
  const along = Math.abs(Math.sin(yaw)) > 0.7; // rotated 90°: swap width/depth
  const hw = (along ? CHEST_SIZE.d : CHEST_SIZE.w) / 2;
  const hd = (along ? CHEST_SIZE.w : CHEST_SIZE.d) / 2;
  const box = world.addBox({ minX: x - hw, minY: y, minZ: z - hd, maxX: x + hw, maxY: y + CHEST_SIZE.h, maxZ: z + hd });
  const chest = { id: world.loot.chests.length + 1, x, y, z, yaw, vault, opened: false, box };
  box.tag = { kind: 'chest', chest };
  world.loot.chests.push(chest);
  const k = key(Math.floor(x / CHEST_CELL), Math.floor(z / CHEST_CELL));
  if (!world.loot.chestCells.has(k)) world.loot.chestCells.set(k, []);
  world.loot.chestCells.get(k).push(chest);
  return chest;
}

function weightedPick(rng, weights, allowed = null) {
  let total = 0;
  for (const [k, w] of Object.entries(weights)) if (!allowed || allowed.includes(k)) total += w;
  let r = rng() * total;
  for (const [k, w] of Object.entries(weights)) {
    if (allowed && !allowed.includes(k)) continue;
    r -= w;
    if (r <= 0) return k;
  }
  return Object.keys(weights).find((k) => !allowed || allowed.includes(k));
}

export function rollWeapon(rng, rarityTable, minRarity = null) {
  const type = weightedPick(rng, LOOT.weaponWeights);
  let allowed = WEAPONS[type].rarities;
  if (minRarity) {
    const min = RARITIES.findIndex((r) => r.id === minRarity);
    allowed = allowed.filter((r) => RARITIES.findIndex((x) => x.id === r) >= min);
    if (!allowed.length) return rollWeapon(rng, rarityTable, minRarity);
  }
  const rarity = weightedPick(rng, rarityTable, allowed);
  return createWeapon(type, rarity);
}

export const rollConsumable = (rng) => consumableItem(weightedPick(rng, LOOT.consumableWeights));
export const rollAmmo = (rng) => ammoItem(weightedPick(rng, LOOT.ammoWeights));

export function rollChestLoot(rng, vault = false) {
  const weapon = vault ? rollWeapon(rng, LOOT.chestRarity, 'epic') : rollWeapon(rng, LOOT.chestRarity);
  const items = [weapon, ammoItem(WEAPONS[weapon.type].ammo, AMMO[WEAPONS[weapon.type].ammo].pile * (vault ? 2 : 1))];
  if (vault) items.push(consumableItem('shieldBig', 2));
  if (rng() < 0.75) items.push(rollConsumable(rng));
  if (rng() < 0.3) items.push(rollConsumable(rng));
  return items;
}

/** A pile of floor loot found in a building. */
export function rollFloorLoot(rng) {
  const r = rng();
  if (r < 0.45) {
    const weapon = rollWeapon(rng, LOOT.floorRarity);
    return [weapon, ammoItem(WEAPONS[weapon.type].ammo)];
  }
  if (r < 0.75) return [rollConsumable(rng)];
  return [rollAmmo(rng), rollAmmo(rng)];
}

export function openChest(world, chest, rng, events) {
  if (chest.opened) return;
  chest.opened = true;
  const items = rollChestLoot(rng, chest.vault);
  const front = forwardXZ(chest.yaw + Math.PI); // toward the opener
  items.forEach((item, i) => {
    const spread = (i - (items.length - 1) / 2) * 0.45;
    const fx = front.x * Math.cos(spread) - front.z * Math.sin(spread);
    const fz = front.x * Math.sin(spread) + front.z * Math.cos(spread);
    spawnLoot(
      world,
      item,
      { x: chest.x + front.x * 0.5, y: chest.y + CHEST_SIZE.h + 0.1, z: chest.z + front.z * 0.5 },
      { x: fx * 2.4, y: 3, z: fz * 2.4 },
    );
  });
  events.push({ type: 'chestOpened', chestId: chest.id, x: chest.x, y: chest.y, z: chest.z, vault: chest.vault });
}

// ---------- Focus & interaction ----------

const _near = [];

/** Decide what the character is looking at that it could interact with. */
export function updateFocus(c, world) {
  const range = LOOT.interactRange;
  const eyeY = c.pos.y + eyeHeight(c);
  const d = lookDir(c.yaw, c.pitch);
  let best = null;
  let bestScore = -Infinity;

  const consider = (kind, id, x, y, z) => {
    const dx = x - c.pos.x;
    const dz = z - c.pos.z;
    const flat = Math.hypot(dx, dz);
    if (flat > range || Math.abs(y - c.pos.y) > 2.2) return;
    const tx = x - c.pos.x;
    const ty = y - eyeY;
    const tz = z - c.pos.z;
    const len = Math.hypot(tx, ty, tz) || 1;
    const cos = (tx * d.x + ty * d.y + tz * d.z) / len;
    if (cos < 0.55 && flat > 0.9) return;
    const score = cos * 2 - flat * 0.25;
    if (score > bestScore) {
      bestScore = score;
      best = { kind, id };
    }
  };

  _near.length = 0;
  for (const l of lootInRadius(world, c.pos.x, c.pos.z, range, _near)) consider('loot', l.id, l.pos.x, l.pos.y + 0.2, l.pos.z);
  _near.length = 0;
  for (const ch of chestsInRadius(world, c.pos.x, c.pos.z, range + 1, _near)) {
    if (!ch.opened) consider('chest', ch.id, ch.x, ch.y + CHEST_SIZE.h * 0.6, ch.z);
  }
  c.focus = best;
  return best;
}

/** Interact key: a press picks up the focused item or opens the focused chest. Also auto-picks up ammo you walk over. */
export function tickInteract(c, cmd, world, dt, rng, events) {
  if (!c.alive) return;

  // Auto-pickup ammo
  _near.length = 0;
  for (const l of lootInRadius(world, c.pos.x, c.pos.z, LOOT.autoPickupRange, _near)) {
    if (l.item.kind !== 'ammo' || l.noAutoFor === c.id || Math.abs(l.pos.y - c.pos.y) > 1.2) continue;
    const before = l.item.count;
    const left = addItem(c, l.item);
    if (left === null) removeLoot(world, l);
    else l.item = left;
    if (!left || left.count < before) events.push({ type: 'pickup', id: c.id, item: { ...l.item, count: before - (left ? left.count : 0) } });
  }

  const focus = updateFocus(c, world);
  const pressed = cmd.interact && !c.lastInteract;
  c.lastInteract = !!cmd.interact;

  if (!pressed || !focus || c.mantle) return;
  if (focus.kind === 'chest') openChest(world, world.loot.chests[focus.id - 1], rng, events);
  else pickUpLoot(c, world, focus.id, events);
}

// Bot AI. Bots only produce commands — they follow exactly the same rules as the player.
// A brain "thinks" ~6 times a second (perceive + decide), and steers/aims every tick.
import { BOT_DIFFICULTY, WEAPONS, RARITIES, CONSUMABLES, AMMO, PLAYER } from '../config.js';
import { angleDiff, rightXZ } from './vec.js';
import { findPath, lineWalkable } from './navgrid.js';
import { lootInRadius, chestsInRadius } from './loot.js';
import { canUse } from './inventory.js';
import { eyeHeight } from './character.js';
import { randRange } from './rng.js';
import { isInside } from './zone.js';

const THINK_INTERVAL = 1 / 6;
const RARITY_INDEX = Object.fromEntries(RARITIES.map((r, i) => [r.id, i]));

export function createBrain(bot, difficulty, rng) {
  bot.ai = {
    diff: BOT_DIFFICULTY[difficulty] || BOT_DIFFICULTY.normal,
    rng,
    // Personality: cautious bots only start fights up close or when attacked.
    aggression: 0.25 + rng() * 0.75,
    think: rng() * THINK_INTERVAL,
    state: 'roam',
    enemyId: null,
    enemyVisible: false,
    lastSeen: null,
    react: 0,
    trackTime: 0,
    aimErr: { x: 0, y: 0, tx: 0, ty: 0, t: 0 },
    aimHigh: false,
    goal: null,
    path: null,
    pathIdx: 0,
    pathGoal: null,
    pathAge: 0,
    needPath: false,
    stuck: { x: bot.pos.x, z: bot.pos.z, t: 0, count: 0, sidestep: 0, dir: 1, regrab: 0 },
    burstOn: false,
    burstTimer: 0,
    strafeDir: 1,
    strafeTimer: 0,
    crouchTimer: 0,
    heard: null,
    hurtBy: null,
    roamTarget: null,
    lootTimer: 0,
    ignored: new Set(),
    cmd: {
      moveX: 0, moveZ: 0, yaw: bot.yaw, pitch: 0, jump: false, sprint: false, crouch: false, fire: false, aim: false,
      reload: false, interact: false, drop: false, slot: -1, slotDelta: 0,
    },
  };
}

// ---------- Inventory helpers ----------

function weaponScore(item) {
  return WEAPONS[item.type].value + RARITY_INDEX[item.rarity] * 0.6;
}

function hasAmmo(bot, item) {
  return item.mag > 0 || bot.ammo[WEAPONS[item.type].ammo] > 0;
}

function armed(bot) {
  return bot.inventory.slots.some((s) => s && s.kind === 'weapon' && hasAmmo(bot, s));
}

function chooseWeaponSlot(bot, dist) {
  let best = -1;
  let bestScore = -Infinity;
  bot.inventory.slots.forEach((item, i) => {
    if (!item || item.kind !== 'weapon' || !hasAmmo(bot, item)) return;
    const def = WEAPONS[item.type];
    const [lo, hi] = def.bestRange;
    let s = weaponScore(item);
    if (dist >= lo && dist <= hi) s += 4;
    else if (dist < lo) s += 1.5;
    else if (dist <= def.range) s += 0.5;
    else s -= 6;
    if (def.splash && dist < 7) s -= 10; // don't rocket yourself
    if (item.mag > 0) s += 1.5;
    if (i === bot.inventory.selected) s += 1; // avoid flip-flopping
    if (s > bestScore) {
      bestScore = s;
      best = i;
    }
  });
  return best;
}

function healSlot(bot) {
  const slots = bot.inventory.slots;
  const find = (type) => slots.findIndex((s) => s && s.kind === 'consumable' && s.type === type && !canUse(bot, type));
  if (bot.shield < 75) {
    const i = find('shieldSmall');
    if (i >= 0) return i;
  }
  if (bot.health < 50) {
    const i = find('medkit');
    if (i >= 0) return i;
  }
  if (bot.shield < 150) {
    const i = find('shieldBig');
    if (i >= 0) return i;
  }
  if (bot.health < 75) {
    const i = find('bandage');
    if (i >= 0) return i;
  }
  return -1;
}

function worstSlot(bot) {
  let worst = -1;
  let worstScore = Infinity;
  bot.inventory.slots.forEach((item, i) => {
    const s = !item ? -100 : item.kind === 'weapon' ? weaponScore(item) - (hasAmmo(bot, item) ? 0 : 3) : 2.5;
    if (s < worstScore) {
      worstScore = s;
      worst = i;
    }
  });
  return worst;
}

/** How much a bot wants a piece of loot (0 = not at all). */
function lootValue(bot, item) {
  const slots = bot.inventory.slots;
  const free = slots.includes(null);
  if (item.kind === 'weapon') {
    const v = weaponScore(item);
    if (slots.some((s) => s && s.kind === 'weapon' && s.type === item.type && RARITY_INDEX[s.rarity] >= RARITY_INDEX[item.rarity])) return 0;
    if (free) return v + 2;
    const w = worstSlot(bot);
    const ws = slots[w].kind === 'weapon' ? weaponScore(slots[w]) : 2.5;
    return v > ws + 0.5 ? v - ws : 0;
  }
  if (item.kind === 'consumable') {
    const stack = slots.find((s) => s && s.kind === 'consumable' && s.type === item.type);
    if (stack && stack.count >= CONSUMABLES[item.type].stack) return 0;
    if (!stack && !free) return 0;
    return item.type.startsWith('shield') ? 3 : 2;
  }
  // ammo: only if it feeds a carried weapon and we're low
  const usesIt = slots.some((s) => s && s.kind === 'weapon' && WEAPONS[s.type].ammo === item.ammoType);
  return usesIt && bot.ammo[item.ammoType] < AMMO[item.ammoType].max * 0.5 ? 2.5 : 0;
}

// ---------- Perception ----------

const _eye = { x: 0, y: 0, z: 0 };
const _dir = { x: 0, y: 0, z: 0 };

function canSee(world, bot, target) {
  _eye.x = bot.pos.x;
  _eye.y = bot.pos.y + eyeHeight(bot);
  _eye.z = bot.pos.z;
  const tx = target.pos.x;
  const ty = target.pos.y + (target.crouching ? 0.7 : 1.2);
  const tz = target.pos.z;
  const d = Math.hypot(tx - _eye.x, ty - _eye.y, tz - _eye.z);
  if (d < 0.01) return true;
  _dir.x = (tx - _eye.x) / d;
  _dir.y = (ty - _eye.y) / d;
  _dir.z = (tz - _eye.z) / d;
  return !world.raycast(_eye, _dir, d - 0.4, { ignoreCharacters: true });
}

function perceive(bot, game) {
  const ai = bot.ai;
  const { world, time } = game;
  const range = ai.diff.viewRange;
  const cands = [];
  for (const c of world.characters.values()) {
    if (c === bot || !c.alive) continue;
    const dx = c.pos.x - bot.pos.x;
    const dz = c.pos.z - bot.pos.z;
    const d2 = dx * dx + dz * dz;
    if (d2 > range * range) continue;
    const d = Math.sqrt(d2);
    const ang = Math.abs(angleDiff(bot.yaw, Math.atan2(-dx, -dz)));
    const hurtByIt = ai.hurtBy && ai.hurtBy.id === c.id && time - ai.hurtBy.time < 2.5;
    if (ang > 1.3 && d > 9 && !hurtByIt) continue; // outside the ~150° view cone
    cands.push({ c, d, prio: c.id === ai.enemyId ? -1 : hurtByIt ? -0.5 : 0 });
  }
  cands.sort((a, b) => a.prio - b.prio || a.d - b.d);
  // Noticing someone takes time: longer far away, quicker if they move, slower if they crouch.
  // Whoever we're already fighting, or who just shot us, is noticed at once.
  let seen = null;
  const notice = ai.notice || (ai.notice = new Map());
  for (let k = 0; k < Math.min(3, cands.length); k++) {
    const { c, d, prio } = cands[k];
    if (!canSee(world, bot, c)) {
      notice.delete(c.id);
      continue;
    }
    const gain = THINK_INTERVAL * (c.speed > 1 ? 1.6 : 1) * (c.crouching ? 0.6 : 1) * (c.firing ? 2.5 : 1);
    const n = (notice.get(c.id) || 0) + gain;
    notice.set(c.id, n);
    if (prio < 0 || n >= 0.35 + d / 30) {
      seen = c;
      break;
    }
  }
  if (notice.size > 12) notice.clear();
  if (seen) {
    if (seen.id !== ai.enemyId || !ai.enemyVisible) {
      if (seen.id !== ai.enemyId) ai.trackTime = 0;
      ai.react = randRange(ai.rng, ai.diff.reaction[0], ai.diff.reaction[1]) * (ai.enemyVisible ? 0.3 : 1);
    }
    ai.enemyId = seen.id;
    ai.enemyVisible = true;
    ai.lastSeen = { x: seen.pos.x, y: seen.pos.y, z: seen.pos.z, time };
    ai.aimHigh = ai.rng() < ai.diff.headChance;
  } else {
    ai.enemyVisible = false;
  }
  // Hearing
  for (const n of game.noises) {
    if (n.shooterId === bot.id || time - n.time > 1) continue;
    if ((n.x - bot.pos.x) ** 2 + (n.z - bot.pos.z) ** 2 < 90 * 90) ai.heard = { x: n.x, z: n.z, time: n.time };
  }
}

// ---------- Decisions ----------

function setGoal(ai, goal) {
  const old = ai.goal;
  ai.goal = goal;
  if (!goal) {
    ai.path = null;
    return;
  }
  if (!old || !ai.pathGoal || Math.hypot(goal.x - ai.pathGoal.x, goal.z - ai.pathGoal.z) > 4) ai.needPath = true;
}

// ---------- Storm ----------

/** The circle a bot should stay in right now: the next one once it's closing in (or soon will). */
function safeCircle(game) {
  const z = game.zone;
  if (!z) return null;
  return z.stage === 'shrink' || z.stage === 'done' || z.timer < 40 ? z.target : z.current;
}

/**
 * Where to run to if the storm forces it, or null.
 * Outside the storm: always. Outside the next circle: when the closing storm edge gets near
 * (so bots stay just ahead of it), or early if the safe circle is very far away.
 */
function stormPull(bot, game) {
  const z = game.zone;
  if (!z) return null;
  const { x, z: bz } = bot.pos;
  const outCurrent = !isInside(z.current, x, bz, 3);
  const outTarget = !isInside(z.target, x, bz, Math.min(12, z.target.r * 0.25));
  const edgeGap = z.current.r - Math.hypot(x - z.current.x, bz - z.current.z); // metres until the storm reaches us
  const toSafety = Math.hypot(x - z.target.x, bz - z.target.z) - z.target.r; // metres to the safe circle
  const closingIn = z.stage !== 'wait' && edgeGap < 45 + z.target.r * 0.1;
  const farAway = z.stage === 'wait' && z.timer < 25 && toSafety > 160;
  if (!outCurrent && !(outTarget && (closingIn || farAway || z.stage === 'done'))) return null;
  // Head for a point a little inside the next circle, on our side of it.
  const dx = x - z.target.x;
  const dz = bz - z.target.z;
  const d = Math.hypot(dx, dz) || 1;
  const r = Math.max(0, z.target.r - Math.min(z.target.r * 0.6, 30));
  return { x: z.target.x + (dx / d) * r, z: z.target.z + (dz / d) * r, kind: 'rotate', outCurrent };
}

function chooseLootTarget(bot, game) {
  const ai = bot.ai;
  const { world } = game;
  const terrain = world.terrain;
  let best = null;
  let bestScore = -Infinity;
  const safe = safeCircle(game);
  for (const ch of chestsInRadius(world, bot.pos.x, bot.pos.z, 85)) {
    if (ch.opened || ai.ignored.has(`c${ch.id}`)) continue;
    if (safe && !isInside(safe, ch.x, ch.z, 3)) continue; // not worth the storm
    if (ch.y > terrain.heightAt(ch.x, ch.z) + 1.5) continue; // upstairs: bots stay on the ground floor
    const d = Math.hypot(ch.x - bot.pos.x, ch.z - bot.pos.z);
    const score = 70 - d + (ch.vault ? 30 : 0) - claimedBy(game, `c${ch.id}`, bot) * 25;
    if (score > bestScore) {
      bestScore = score;
      best = { kind: 'chest', id: ch.id, x: ch.x, y: ch.y, z: ch.z };
    }
  }
  for (const l of lootInRadius(world, bot.pos.x, bot.pos.z, 45)) {
    if (!l.settled || ai.ignored.has(`l${l.id}`) || l.pos.y > terrain.heightAt(l.pos.x, l.pos.z) + 1.5) continue;
    if (safe && !isInside(safe, l.pos.x, l.pos.z, 3)) continue;
    const v = lootValue(bot, l.item);
    if (v <= 0) continue;
    const d = Math.hypot(l.pos.x - bot.pos.x, l.pos.z - bot.pos.z);
    const score = v * 14 - d - claimedBy(game, `l${l.id}`, bot) * 25;
    if (score > bestScore) {
      bestScore = score;
      best = { kind: 'loot', id: l.id, x: l.pos.x, y: l.pos.y, z: l.pos.z };
    }
  }
  return best;
}

/** How many other bots are already heading for this loot (cached once per tick). */
function claimedBy(game, key, me) {
  if (game._claimTick !== game.tickCount) {
    game._claimTick = game.tickCount;
    game._claims = new Map();
    for (const b of game.bots) {
      const k = b.alive && b.ai.goal && b.ai.goal.key;
      if (k) game._claims.set(k, (game._claims.get(k) || 0) + 1);
    }
  }
  const n = game._claims.get(key) || 0;
  return me.ai.goal && me.ai.goal.key === key ? n - 1 : n;
}

function wantsLoot(bot) {
  const weapons = bot.inventory.slots.filter((s) => s && s.kind === 'weapon' && hasAmmo(bot, s));
  const heals = bot.inventory.slots.filter((s) => s && s.kind === 'consumable');
  return weapons.length < 2 || heals.length === 0 || bot.inventory.slots.includes(null);
}

function pickRoamTarget(bot, game) {
  const ai = bot.ai;
  const { map, rng } = game;
  // Late game without a storm: hunt the nearest survivor so the match finishes.
  if (!game.zone && (game.alive <= 12 || game.time > 420)) {
    let best = null;
    let bd = Infinity;
    for (const c of game.world.characters.values()) {
      if (c === bot || !c.alive) continue;
      const d = Math.hypot(c.pos.x - bot.pos.x, c.pos.z - bot.pos.z);
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    if (best) return { x: best.pos.x + randRange(rng, -15, 15), z: best.pos.z + randRange(rng, -15, 15), kind: 'hunt' };
  }
  const safe = safeCircle(game);
  const places = (map.places || []).filter((p) => !safe || isInside(safe, p.x, p.z, 20));
  if (places.length && rng() < 0.7) {
    const p = places[Math.floor(rng() * places.length)];
    return { x: p.x + randRange(rng, -40, 40), z: p.z + randRange(rng, -40, 40), kind: 'roam' };
  }
  if (safe && safe.r > 10) {
    const a = rng() * Math.PI * 2;
    const r = Math.sqrt(rng()) * safe.r * 0.8;
    return { x: safe.x + Math.cos(a) * r, z: safe.z + Math.sin(a) * r, kind: 'roam' };
  }
  const a = rng() * Math.PI * 2;
  const r = randRange(rng, 40, 140);
  const h = map.half - 40;
  return {
    x: Math.max(-h, Math.min(h, bot.pos.x + Math.cos(a) * r)),
    z: Math.max(-h, Math.min(h, bot.pos.z + Math.sin(a) * r)),
    kind: 'roam',
  };
}

/** How far away a bot is willing to start a fight, given its best gun. */
function engageRange(bot) {
  let r = 0;
  for (const s of bot.inventory.slots) {
    if (!s || s.kind !== 'weapon' || !hasAmmo(bot, s)) continue;
    r = Math.max(r, s.type === 'sniper' ? 130 : s.type === 'ar' ? 55 : s.type === 'rocket' ? 50 : 35);
  }
  return r * (bot.ai.diff === BOT_DIFFICULTY.hard ? 1.2 : 1);
}

function decide(bot, game) {
  const ai = bot.ai;
  const { time } = game;
  const isArmed = armed(bot);
  const hp = bot.health + bot.shield;
  const enemy = ai.enemyId != null ? game.world.characters.get(ai.enemyId) : null;
  const enemyAlive = enemy && enemy.alive;

  // Bots only start fights within their weapon's comfortable range (or when shot at),
  // and a bot that still needs gear keeps looting rather than picking distant fights.
  const enemyDist = enemyAlive ? Math.hypot(enemy.pos.x - bot.pos.x, enemy.pos.z - bot.pos.z) : Infinity;
  const recentlyHurt = ai.hurtBy && time - ai.hurtBy.time < 4;
  const inFight = ai.state === 'fight' && enemyDist < engageRange(bot) * 1.4;
  // Opening minutes: everyone is busy gearing up and picks fewer fights.
  // Endgame (few left, or a long match): everyone fights so the match finishes.
  const endgame = game.alive <= 12 || time > 420;
  const opening = time < 90 ? 0.35 : time < 180 ? 0.55 : 1;
  const willing = endgame ? engageRange(bot) : Math.max(10, engageRange(bot) * ai.aggression * opening);
  const tooFar = enemyDist > willing && !inFight && !recentlyHurt;
  const busyLooting = ai.state === 'loot' && wantsLoot(bot) && enemyDist > 30 && !recentlyHurt;

  // The storm comes first — unless an enemy is right on top of us.
  const pull = stormPull(bot, game);
  if (pull && !(isArmed && ai.enemyVisible && enemyAlive && enemyDist < (pull.outCurrent ? 12 : 30))) {
    ai.state = 'rotate';
    ai.holdUntil = 0;
    setGoal(ai, pull);
    return;
  }
  // Unarmed: only run from an armed enemy that's close; otherwise keep looting.
  const threat = !isArmed && enemyAlive && (!armed(enemy) || enemyDist > 40);
  if (ai.enemyVisible && enemyAlive && !busyLooting && !(isArmed && tooFar) && !threat) {
    if (isArmed && !(hp < 45 && healSlot(bot) >= 0 && ai.rng() < 0.6)) {
      ai.state = 'fight';
      ai.engagedId = enemy.id;
      setGoal(ai, null);
      return;
    }
    ai.state = 'flee';
    const dx = bot.pos.x - enemy.pos.x;
    const dz = bot.pos.z - enemy.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    setGoal(ai, { x: bot.pos.x + (dx / d) * 30, z: bot.pos.z + (dz / d) * 30, kind: 'flee' });
    return;
  }
  // Safe for a moment: top up with whatever helps (healSlot only offers useful items).
  if (healSlot(bot) >= 0 && (!ai.lastSeen || time - ai.lastSeen.time > 2.5)) {
    ai.state = 'heal';
    setGoal(ai, null);
    return;
  }
  // Only chase someone we were actually fighting (or who shot us), not everyone we spotted.
  const ourFight = ai.engagedId === ai.enemyId || (ai.hurtBy && ai.hurtBy.id === ai.enemyId && time - ai.hurtBy.time < 6);
  if (isArmed && enemyAlive && ourFight && ai.lastSeen && time - ai.lastSeen.time < 6 && enemyDist < engageRange(bot) * 1.3) {
    ai.state = 'chase';
    setGoal(ai, { x: ai.lastSeen.x, z: ai.lastSeen.z, kind: 'chase' });
    return;
  }
  if (!isArmed || wantsLoot(bot)) {
    const current = ai.state === 'loot' && ai.goal && stillValid(ai.goal, game) ? ai.goal : null;
    const target = current || chooseLootTarget(bot, game);
    if (target) {
      ai.state = 'loot';
      if (!current) {
        target.key = `${target.kind === 'chest' ? 'c' : 'l'}${target.id}`;
        ai.lootTimer = 0;
        setGoal(ai, target);
      }
      return;
    }
  }
  if (isArmed && ai.heard && time - ai.heard.time < 4 && ai.rng() < ai.aggression) {
    ai.state = 'investigate';
    ai.holdUntil = 0;
    setGoal(ai, { x: ai.heard.x, z: ai.heard.z, kind: 'investigate' });
    return;
  }
  // Geared up: cautious bots settle in for a while instead of wandering into fights.
  if (isArmed && (ai.holdUntil || 0) > time) {
    ai.state = 'hold';
    setGoal(ai, null);
    return;
  }
  if (isArmed && ai.state !== 'hold' && ai.state !== 'roam' && ai.rng() < (1 - ai.aggression) * 0.9 && game.alive > 12) {
    ai.state = 'hold';
    ai.holdUntil = time + randRange(ai.rng, 15, 50);
    setGoal(ai, null);
    return;
  }
  ai.state = 'roam';
  const hunting = !game.zone && (game.alive <= 12 || time > 420);
  if (!ai.roamTarget || Math.hypot(ai.roamTarget.x - bot.pos.x, ai.roamTarget.z - bot.pos.z) < 8 || (hunting && (ai.roamTarget.kind !== 'hunt' || ai.rng() < 0.15))) {
    ai.roamTarget = pickRoamTarget(bot, game);
  }
  setGoal(ai, ai.roamTarget);
}

function stillValid(goal, game) {
  if (goal.kind === 'chest') return !game.world.loot.chests[goal.id - 1].opened;
  if (goal.kind === 'loot') return game.world.loot.items.has(goal.id);
  return true;
}

// ---------- Movement ----------

function turnToward(bot, ai, yaw, pitch, rate, dt) {
  const dy = angleDiff(bot.ai.cmd.yaw, yaw);
  const max = rate * dt;
  ai.cmd.yaw += Math.max(-max, Math.min(max, dy));
  const dp = pitch - ai.cmd.pitch;
  ai.cmd.pitch += Math.max(-max, Math.min(max, dp));
}

/** Steer along the path toward the goal. Returns the remaining straight-line distance. */
function followGoal(bot, game, dt, { sprint = false, face = true } = {}) {
  const ai = bot.ai;
  const cmd = ai.cmd;
  const goal = ai.goal;
  if (!goal) return 0;

  if (ai.needPath && game.pathBudget > 0) {
    game.pathBudget--;
    ai.needPath = false;
    ai.pathAge = 0;
    ai.pathGoal = { x: goal.x, z: goal.z };
    let tx = goal.x;
    let tz = goal.z;
    const far = Math.hypot(tx - bot.pos.x, tz - bot.pos.z);
    if (far > 160) {
      tx = bot.pos.x + ((tx - bot.pos.x) / far) * 150;
      tz = bot.pos.z + ((tz - bot.pos.z) / far) * 150;
    }
    ai.path = lineWalkable(game.nav, bot.pos.x, bot.pos.z, tx, tz) ? [{ x: tx, z: tz }] : findPath(game.nav, bot.pos.x, bot.pos.z, tx, tz);
    ai.pathIdx = 0;
  }
  ai.pathAge += dt;
  if (ai.goal.kind === 'chase' && ai.pathAge > 1.5) ai.needPath = true;

  let wx = goal.x;
  let wz = goal.z;
  if (ai.path && ai.pathIdx < ai.path.length) {
    while (ai.pathIdx < ai.path.length - 1 && Math.hypot(ai.path[ai.pathIdx].x - bot.pos.x, ai.path[ai.pathIdx].z - bot.pos.z) < 0.9) ai.pathIdx++;
    wx = ai.path[ai.pathIdx].x;
    wz = ai.path[ai.pathIdx].z;
    // Reached the end of a partial (long-distance) path: plan the next leg.
    if (ai.pathIdx === ai.path.length - 1 && Math.hypot(wx - bot.pos.x, wz - bot.pos.z) < 1.5 && Math.hypot(goal.x - wx, goal.z - wz) > 3) ai.needPath = true;
  }
  const dx = wx - bot.pos.x;
  const dz = wz - bot.pos.z;
  const d = Math.hypot(dx, dz);
  const remaining = Math.hypot(goal.x - bot.pos.x, goal.z - bot.pos.z);
  if (d < 0.05) return remaining;

  let mx = dx / d;
  let mz = dz / d;
  if (ai.stuck.sidestep > 0) {
    // Briefly slide sideways to get unstuck.
    const r = rightXZ(Math.atan2(-mx, -mz));
    mx = r.x * ai.stuck.dir;
    mz = r.z * ai.stuck.dir;
  }
  if (face) turnToward(bot, ai, Math.atan2(-mx, -mz), 0, 9, dt);
  // Convert the world direction into movement relative to where we're facing.
  const s = Math.sin(cmd.yaw);
  const c = Math.cos(cmd.yaw);
  cmd.moveZ = -s * mx - c * mz; // dot with forward (−sin, −cos)
  cmd.moveX = c * mx - s * mz; // dot with right (cos, −sin)
  cmd.sprint = sprint && cmd.moveZ > 0.7 && remaining > 10;
  return remaining;
}

function checkStuck(bot, ai, dt, wantsToMove) {
  const st = ai.stuck;
  if (st.sidestep > 0) st.sidestep -= dt;
  if (!wantsToMove) {
    st.t = 0;
    st.x = bot.pos.x;
    st.z = bot.pos.z;
    return;
  }
  st.t += dt;
  if (st.t < 1) return;
  const moved = Math.hypot(bot.pos.x - st.x, bot.pos.z - st.z);
  st.t = 0;
  st.x = bot.pos.x;
  st.z = bot.pos.z;
  if (moved > 0.6) {
    st.count = 0;
    return;
  }
  st.count++;
  if (st.count === 1) {
    ai.cmd.jump = true; // jump, then press again in mid-air to mantle over it
    st.regrab = 0.1;
  } else if (st.count === 2) ai.needPath = true;
  else if (st.count === 3) {
    st.sidestep = 0.7;
    st.dir = ai.rng() < 0.5 ? -1 : 1;
  } else {
    if (ai.goal && ai.goal.key) ai.ignored.add(ai.goal.key);
    ai.roamTarget = null;
    ai.goal = null;
    ai.path = null;
    ai.think = 0;
    st.count = 0;
  }
}

// ---------- States ----------

function fightTick(bot, game, dt) {
  const ai = bot.ai;
  const cmd = ai.cmd;
  const enemy = game.world.characters.get(ai.enemyId);
  if (!enemy || !enemy.alive) {
    ai.state = 'roam';
    ai.enemyId = null;
    return;
  }
  const dx = enemy.pos.x - bot.pos.x;
  const dz = enemy.pos.z - bot.pos.z;
  const dist = Math.hypot(dx, dz);

  const slot = chooseWeaponSlot(bot, dist);
  if (slot >= 0 && slot !== bot.inventory.selected) cmd.slot = slot;
  const w = bot.weapon;
  const def = w ? WEAPONS[w.type] : null;

  // Aim point, leading moving targets for travelling projectiles.
  let ax = enemy.pos.x;
  let ay = enemy.pos.y + (enemy.crouching ? 0.6 : ai.aimHigh ? 1.55 : 1.05);
  let az = enemy.pos.z;
  if (def && def.projectile) {
    const t = dist / def.projectile.speed;
    ax += enemy.vel.x * t;
    az += enemy.vel.z * t;
    ay += 0.5 * def.projectile.gravity * t * t;
  }
  const r = rightXZ(cmd.yaw);
  const ox = bot.pos.x + r.x * PLAYER.shoulderRight;
  const oy = bot.pos.y + eyeHeight(bot) + PLAYER.shoulderUp;
  const oz = bot.pos.z + r.z * PLAYER.shoulderRight;
  const hd = Math.hypot(ax - ox, az - oz) || 0.01;
  const wantYaw = Math.atan2(-(ax - ox), -(az - oz));
  const wantPitch = Math.atan2(ay - oy, hd);

  // Human-like wobble: metres at the target, worse at range and against movers, better with tracking time.
  const e = ai.aimErr;
  e.t -= dt;
  if (e.t <= 0) {
    // Tracking a target slowly steadies the aim, but never below 60% of the wobble.
    const gain = Math.max(0.6, 1 - ai.trackTime * ai.diff.accuracyGain * 0.2);
    const mag = ai.diff.aimError * (1 + dist / 30) * (1 + enemy.speed / 5) * (bot.speed > 1 ? 1.3 : 1) * gain * (bot.aiming ? 0.75 : 1);
    const a = ai.rng() * Math.PI * 2;
    e.tx = (Math.cos(a) * mag * Math.sqrt(ai.rng())) / Math.max(dist, 2);
    e.ty = (Math.sin(a) * mag * 0.7 * Math.sqrt(ai.rng())) / Math.max(dist, 2);
    e.t = randRange(ai.rng, 0.18, 0.4);
  }
  const k = Math.min(1, dt * 8);
  e.x += (e.tx - e.x) * k;
  e.y += (e.ty - e.y) * k;
  turnToward(bot, ai, wantYaw + e.x, wantPitch + e.y, ai.diff.turnRate, dt);

  ai.react -= dt;
  ai.trackTime += dt;

  // Shooting
  const off = Math.abs(angleDiff(cmd.yaw, wantYaw)) + Math.abs(cmd.pitch - wantPitch);
  if (w && def) {
    const inRange = dist <= def.range * 0.9;
    const ready = ai.react <= 0 && off < 0.3 && inRange && ai.enemyVisible && (bot.equipLeft || 0) <= 0;
    if (w.mag === 0) {
      const other = bot.inventory.slots.findIndex((s, i) => i !== bot.inventory.selected && s && s.kind === 'weapon' && s.mag > 0);
      if (other >= 0 && dist < 25) cmd.slot = other;
      else cmd.reload = true;
    } else if (def.auto) {
      // At long range: short, patient bursts.
      const far = dist > 50 ? 1 : 0;
      ai.burstTimer -= dt;
      if (ai.burstTimer <= 0) {
        ai.burstOn = !ai.burstOn;
        ai.burstTimer = ai.burstOn ? randRange(ai.rng, ...ai.diff.burst) * (far ? 0.4 : 1) : randRange(ai.rng, ...ai.diff.pause) * (far ? 2.5 : 1);
      }
      cmd.fire = ready && ai.burstOn;
    } else {
      const settle = def.projectile ? 0.5 : 0.15;
      cmd.fire = ready && ai.trackTime > settle && (game.tickCount + bot.id) % 2 === 0;
    }
    cmd.aim = (dist > 22 && w.type !== 'shotgun') || (w.type === 'sniper' && dist > 12);
  }

  // Movement: strafe, keep a good range for the weapon.
  ai.strafeTimer -= dt;
  if (ai.strafeTimer <= 0) {
    ai.strafeDir = ai.rng() < ai.diff.strafe ? (ai.rng() < 0.5 ? -1 : 1) : 0;
    ai.strafeTimer = randRange(ai.rng, 0.5, 1.4);
  }
  cmd.moveX = ai.strafeDir;
  if (def) {
    const [lo, hi] = def.bestRange;
    cmd.moveZ = dist > hi ? 1 : dist < lo ? -0.8 : 0;
  }
  if (cmd.moveZ > 0 && dist > 25 && ai.rng() < 0.02) ai.crouchTimer = 0;
  if (ai.crouchTimer > 0) ai.crouchTimer -= dt;
  else if (dist > 35 && cmd.moveZ === 0 && ai.rng() < ai.diff.crouch * dt) ai.crouchTimer = randRange(ai.rng, 1, 2.5);
  cmd.crouch = ai.crouchTimer > 0;
  if (dist < 12 && ai.rng() < 0.6 * dt) cmd.jump = true;
}

function healTick(bot, game, dt) {
  const ai = bot.ai;
  const cmd = ai.cmd;
  const slot = healSlot(bot);
  if (slot < 0) {
    ai.state = 'roam';
    return;
  }
  if (bot.inventory.selected !== slot) cmd.slot = slot;
  else cmd.fire = true;
  cmd.crouch = ai.diff.crouch > 0;
}

/** Stay put, crouched now and then, looking around. */
function holdTick(bot, game, dt) {
  const ai = bot.ai;
  const cmd = ai.cmd;
  ai.lookTimer = (ai.lookTimer || 0) - dt;
  if (ai.lookTimer <= 0) {
    ai.lookYaw = ai.cmd.yaw + randRange(ai.rng, -2.2, 2.2);
    ai.lookTimer = randRange(ai.rng, 1.5, 4);
    ai.holdCrouch = ai.rng() < ai.diff.crouch * 3;
  }
  turnToward(bot, ai, ai.lookYaw, 0, 2.5, dt);
  cmd.crouch = !!ai.holdCrouch;
  if (bot.weapon && bot.weapon.mag < WEAPONS[bot.weapon.type].mag && bot.ammo[WEAPONS[bot.weapon.type].ammo] > 0) cmd.reload = true;
}

function lootTick(bot, game, dt) {
  const ai = bot.ai;
  const cmd = ai.cmd;
  const goal = ai.goal;
  if (!goal || !stillValid(goal, game)) {
    ai.goal = null;
    ai.think = 0;
    return;
  }
  // Loot can move (spilling out of a chest): track where it really is.
  if (goal.kind === 'loot') {
    const live = game.world.loot.items.get(goal.id);
    if (Math.hypot(live.pos.x - goal.x, live.pos.z - goal.z) > 0.05) {
      goal.x = live.pos.x;
      goal.y = live.pos.y;
      goal.z = live.pos.z;
      if (ai.pathGoal && Math.hypot(goal.x - ai.pathGoal.x, goal.z - ai.pathGoal.z) > 1.5) ai.needPath = true;
    }
  }
  const d = Math.hypot(goal.x - bot.pos.x, goal.z - bot.pos.z);
  const reach = goal.kind === 'chest' ? 1.7 : 1.3;
  // Same rule as the player: interact once the target is what we're focused on.
  const focused = bot.focus && bot.focus.kind === goal.kind && bot.focus.id === goal.id;
  if (!focused && d > reach) {
    followGoal(bot, game, dt, { sprint: d > 12 });
    checkStuck(bot, ai, dt, true);
    return;
  }
  // In reach: face it and interact.
  checkStuck(bot, ai, dt, false);
  const ty = goal.kind === 'chest' ? goal.y + 0.5 : goal.y + 0.2;
  const eyeY = bot.pos.y + eyeHeight(bot);
  turnToward(bot, ai, Math.atan2(-(goal.x - bot.pos.x), -(goal.z - bot.pos.z)), Math.atan2(ty - eyeY, Math.max(d, 0.3)), 12, dt);
  ai.lootTimer += dt;
  if (goal.kind === 'loot') {
    const loot = game.world.loot.items.get(goal.id);
    if (loot && loot.item.kind !== 'ammo' && !bot.inventory.slots.includes(null) && loot.item.kind === 'weapon') {
      const w = worstSlot(bot);
      if (bot.inventory.selected !== w) cmd.slot = w;
    }
  }
  // Tap E (a fresh press every few ticks) once it's in view — same as the player.
  cmd.interact = ai.lootTimer > 0.15 && (game.tickCount + bot.id) % 3 === 0;
  if (ai.lootTimer > 3.5) {
    ai.ignored.add(goal.key);
    ai.goal = null;
    ai.think = 0;
  }
}

// ---------- Entry point ----------

export function botCommand(bot, game, dt) {
  const ai = bot.ai;
  const cmd = ai.cmd;
  cmd.moveX = 0;
  cmd.moveZ = 0;
  cmd.jump = false;
  cmd.sprint = false;
  cmd.crouch = false;
  cmd.fire = false;
  cmd.aim = false;
  cmd.reload = false;
  cmd.interact = false;
  cmd.drop = false;
  cmd.slot = -1;
  cmd.slotDelta = 0;

  ai.think -= dt;
  if (ai.think <= 0) {
    ai.think = THINK_INTERVAL + ai.rng() * 0.05;
    perceive(bot, game);
    decide(bot, game);
  }

  // The second press of a stuck bot's jump-and-mantle (see checkStuck).
  const st = ai.stuck;
  if (st.regrab > 0) {
    st.regrab -= dt;
    if (st.regrab <= 0 && !bot.onGround) cmd.jump = true;
  }

  switch (ai.state) {
    case 'fight':
      fightTick(bot, game, dt);
      break;
    case 'heal':
      healTick(bot, game, dt);
      break;
    case 'loot':
      lootTick(bot, game, dt);
      break;
    case 'hold':
      holdTick(bot, game, dt);
      break;
    default: {
      const remaining = followGoal(bot, game, dt, { sprint: ai.state !== 'investigate' });
      checkStuck(bot, ai, dt, remaining > 2);
      // Out of combat: reload and switch to the best weapon for medium range.
      if (bot.weapon && bot.weapon.mag < WEAPONS[bot.weapon.type].mag * 0.5 && bot.ammo[WEAPONS[bot.weapon.type].ammo] > 0) cmd.reload = true;
      else if (!bot.weapon && armed(bot)) cmd.slot = chooseWeaponSlot(bot, 30);
      if (ai.state === 'chase') cmd.aim = false;
    }
  }
  return cmd;
}

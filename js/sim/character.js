// Characters (player, bots, dummies) and their movement physics.
// Movement is the same for everyone; only where the command comes from differs.
import { PLAYER, INVENTORY } from '../config.js';
import { clamp, forwardXZ } from './vec.js';
import { circleBoxPush, circleOverlapsBox } from './collision.js';
import { dealDamage } from './damage.js';

export function createCharacter({ id, name, kind = 'bot', pos = { x: 0, y: 0, z: 0 }, yaw = 0 }) {
  return {
    id,
    name,
    kind,
    pos: { x: pos.x, y: pos.y, z: pos.z },
    prevPos: { x: pos.x, y: pos.y, z: pos.z },
    vel: { x: 0, y: 0, z: 0 },
    yaw,
    pitch: 0,
    onGround: false,
    health: PLAYER.maxHealth,
    shield: 0,
    alive: true,
    weapon: null,
    inventory: { slots: new Array(INVENTORY.slots).fill(null), selected: 0 },
    slotPrefs: null, // { itemType: slotIndex }: where pickups go when that slot is empty (player setting)
    ammo: { light: 0, medium: 0, heavy: 0, shells: 0, rockets: 0 },
    equipLeft: 0,
    useItem: null,
    focus: null,
    lastFire: false,
    lastInteract: false,
    lastUseFire: false,
    aiming: false,
    sprinting: false,
    crouching: false,
    slideTime: 0,
    mantle: null,
    inWater: false,
    firing: false,
    speed: 0,
    airTime: 0,
    jumpBuffer: 0,
    mantleBuffer: 0,
    lastJumpCmd: false,
    lastCrouchCmd: false,
    hopSpeed: 0, // speed carried by a chain of held-jump hops (players only), 0 = no chain
    useSpeedMul: 1,
    stats: { kills: 0, damageDealt: 0 },
  };
}

export const characterHeight = (c) => (c.crouching ? PLAYER.crouchHeight : PLAYER.height);
export const eyeHeight = (c) => (c.crouching ? PLAYER.crouchEyeHeight : PLAYER.eyeHeight);

const _boxes = [];

function queryAround(world, x, z, r) {
  _boxes.length = 0;
  return world.grid.query(x - r, z - r, x + r, z + r, _boxes);
}

/** True if a circle at (x, z) with vertical span [y0, y1] is free of boxes. */
function spaceFree(world, x, z, r, y0, y1) {
  for (const b of queryAround(world, x, z, r)) {
    if (b.maxY <= y0 || b.minY >= y1) continue;
    if (circleOverlapsBox(x, z, r, b)) return false;
  }
  return true;
}

/** Push the character out of walls. Boxes whose top is within `step` of the feet are stepped onto instead. */
function resolveHorizontal(c, world, step) {
  const r = PLAYER.radius;
  const h = characterHeight(c);
  for (let iter = 0; iter < 3; iter++) {
    let moved = false;
    for (const b of queryAround(world, c.pos.x, c.pos.z, r)) {
      if (b.maxY <= c.pos.y + step || b.minY >= c.pos.y + h) continue;
      const p = circleBoxPush(c.pos.x, c.pos.z, r, b);
      if (!p) continue;
      c.pos.x += p.x;
      c.pos.z += p.z;
      const pl = Math.hypot(p.x, p.z);
      if (pl > 0) {
        const nx = p.x / pl;
        const nz = p.z / pl;
        const vn = c.vel.x * nx + c.vel.z * nz;
        if (vn < 0) {
          c.vel.x -= vn * nx;
          c.vel.z -= vn * nz;
        }
      }
      moved = true;
    }
    if (!moved) break;
  }
}

/**
 * Highest walkable surface at (x, z) no higher than maxY.
 * Returns Infinity when a wall rises through maxY there (nothing to climb onto).
 */
function surfaceTop(world, x, z, maxY) {
  let top = world.terrain.heightAt(x, z);
  if (top > maxY) return Infinity;
  for (const b of queryAround(world, x, z, 0.2)) {
    if (!circleOverlapsBox(x, z, 0.15, b)) continue;
    if (b.maxY <= maxY + 1e-6) {
      if (b.maxY > top) top = b.maxY;
    } else if (b.minY < maxY) {
      return Infinity;
    }
  }
  return top;
}

/** Look for a ledge in front of the character that it can climb onto (top at least `minRise` above the feet). */
export function findMantle(c, world, minRise = PLAYER.mantleMin) {
  const P = PLAYER;
  const f = forwardXZ(c.yaw);
  const h = characterHeight(c);
  for (const reach of [P.radius + 0.3, P.radius + 0.65]) {
    const px = c.pos.x + f.x * reach;
    const pz = c.pos.z + f.z * reach;
    const top = surfaceTop(world, px, pz, c.pos.y + P.mantleMax);
    if (!Number.isFinite(top)) return null; // a tall wall in front
    const rise = top - c.pos.y;
    if (rise < minRise) continue;
    // Stand fully on the ledge, a little past its edge.
    const tx = c.pos.x + f.x * (reach + P.radius * 0.6);
    const tz = c.pos.z + f.z * (reach + P.radius * 0.6);
    const tTop = surfaceTop(world, tx, tz, top + 0.05);
    if (!Number.isFinite(tTop) || Math.abs(tTop - top) > 0.3) continue;
    // Room above our head to climb up, and room to stand (or crouch) on top.
    if (!spaceFree(world, c.pos.x, c.pos.z, P.radius * 0.9, c.pos.y + h, top + P.crouchHeight)) return null;
    let crouch = false;
    if (!spaceFree(world, tx, tz, P.radius * 0.95, tTop + 0.02, tTop + P.height)) {
      if (!spaceFree(world, tx, tz, P.radius * 0.95, tTop + 0.02, tTop + P.crouchHeight)) return null;
      crouch = true;
    }
    return { x: tx, y: tTop, z: tz, crouch, rise };
  }
  return null;
}

function stepMantle(c, dt) {
  const m = c.mantle;
  m.t += dt;
  const k = Math.min(1, m.t / m.dur);
  // Rise first, then move over the edge.
  const up = Math.min(1, k / 0.6);
  const over = Math.max(0, (k - 0.45) / 0.55);
  c.pos.y = m.from.y + (m.to.y + 0.02 - m.from.y) * (1 - (1 - up) * (1 - up));
  c.pos.x = m.from.x + (m.to.x - m.from.x) * over;
  c.pos.z = m.from.z + (m.to.z - m.from.z) * over;
  if (k >= 1) {
    c.pos.x = m.to.x;
    c.pos.y = m.to.y;
    c.pos.z = m.to.z;
    if (m.crouch) c.crouching = true;
    c.mantle = null;
    c.onGround = true;
    c.airTime = 0;
  }
}

export function stepCharacter(c, cmd, world, dt, events = []) {
  if (!c.alive) return;
  const P = PLAYER;

  c.yaw = cmd.yaw;
  c.pitch = clamp(cmd.pitch, -P.maxPitch, P.maxPitch);

  // Holding jump keeps the jump buffer full (hop again on landing), but a mantle needs a fresh press.
  const jumpPressed = !!cmd.jump && !c.lastJumpCmd;
  c.lastJumpCmd = !!cmd.jump;
  if (cmd.jump) c.jumpBuffer = P.jumpBuffer;
  else c.jumpBuffer = Math.max(0, c.jumpBuffer - dt);
  c.mantleBuffer = Math.max(0, c.mantleBuffer - dt);
  if (!cmd.jump || c.kind !== 'player') c.hopSpeed = 0; // the chain needs jump held the whole time

  if (c.mantle) {
    c.aiming = false;
    c.sprinting = false;
    c.vel.x = c.vel.y = c.vel.z = 0;
    c.speed = 0;
    stepMantle(c, dt);
    return;
  }

  // --- Crouch & slide ---
  const wantCrouch = !!cmd.crouch;
  const crouchPressed = wantCrouch && !c.lastCrouchCmd;
  c.lastCrouchCmd = wantCrouch;
  if (wantCrouch) {
    if (crouchPressed && c.onGround && !c.crouching && c.speed >= P.slideMinSpeed && !c.inWater) {
      c.slideTime = P.slideDuration;
      const sp = Math.hypot(c.vel.x, c.vel.z) || 1;
      c.vel.x = (c.vel.x / sp) * P.slideSpeed;
      c.vel.z = (c.vel.z / sp) * P.slideSpeed;
    }
    c.crouching = true;
  } else if (c.crouching && spaceFree(world, c.pos.x, c.pos.z, P.radius * 0.95, c.pos.y + P.crouchHeight, c.pos.y + P.height)) {
    c.crouching = false;
    c.slideTime = 0;
  }
  if (!c.crouching) c.slideTime = 0;

  c.inWater = world.waterLevel !== undefined && c.pos.y < world.waterLevel - P.waterWadeDepth;
  c.aiming = !!cmd.aim;

  let mx = cmd.moveX || 0;
  let mz = cmd.moveZ || 0;
  const ml = Math.hypot(mx, mz);
  if (ml > 1) {
    mx /= ml;
    mz /= ml;
  }
  c.sprinting = !!cmd.sprint && mz > 0.1 && !c.aiming && !cmd.fire && !c.crouching && !c.inWater && c.useSpeedMul === 1;

  let speed;
  if (c.crouching) speed = P.crouchSpeed;
  else if (c.aiming) speed = P.aimSpeed;
  else if (c.sprinting) speed = P.sprintSpeed;
  else speed = P.walkSpeed;
  if (mz < 0) speed *= P.backwardFactor;
  if (c.inWater) speed *= P.waterSpeedMul;
  speed *= c.useSpeedMul;

  const s = Math.sin(c.yaw);
  const co = Math.cos(c.yaw);
  if (c.slideTime > 0) {
    // Sliding: keep momentum, slow down towards crouch speed, steer a little.
    c.slideTime = Math.max(0, c.slideTime - dt);
    const sp = Math.hypot(c.vel.x, c.vel.z);
    const target = P.crouchSpeed + (P.slideSpeed - P.crouchSpeed) * (c.slideTime / P.slideDuration);
    if (sp > 0.01) {
      const k = Math.min(sp, target) / sp;
      c.vel.x *= k;
      c.vel.z *= k;
    }
  } else {
    // forward = (−sin, −cos), right = (cos, −sin)
    const wx = (-s * mz + co * mx) * speed;
    const wz = (-co * mz - s * mx) * speed;
    if (c.hopSpeed > 0) {
      // Mid-chain: the speed holds, and the direction swings toward where you steer.
      // (No keys: coast straight on. To slow down, let go of jump.)
      const wish = Math.hypot(wx, wz);
      if (wish > c.hopSpeed) c.hopSpeed = Math.min(wish, c.hopSpeed + P.accelAir * dt);
      let heading = Math.atan2(c.vel.z, c.vel.x);
      if (wish > 0) {
        const want = Math.atan2(wz, wx);
        const turn = Math.atan2(Math.sin(want - heading), Math.cos(want - heading));
        heading += clamp(turn, -P.hopTurnRate * dt, P.hopTurnRate * dt);
      }
      c.vel.x = Math.cos(heading) * c.hopSpeed;
      c.vel.z = Math.sin(heading) * c.hopSpeed;
    } else {
      const accel = (c.onGround ? P.accelGround : P.accelAir) * dt;
      let dvx = wx - c.vel.x;
      let dvz = wz - c.vel.z;
      const dl = Math.hypot(dvx, dvz);
      if (dl > accel) {
        dvx *= accel / dl;
        dvz *= accel / dl;
      }
      c.vel.x += dvx;
      c.vel.z += dvz;
    }
  }

  // --- Jump or mantle ---
  // Space on the ground always jumps. Pressing it again in mid-air climbs a ledge in front;
  // so does a press while crouched, since a crouched character can't jump.
  const canJump = (c.onGround || c.airTime < P.coyoteTime) && !c.crouching;
  if (jumpPressed && !canJump) c.mantleBuffer = P.jumpBuffer;
  let jumped = false;
  if (c.jumpBuffer > 0 && canJump) {
    c.jumpBuffer = 0;
    c.mantleBuffer = 0;
    c.vel.y = P.jumpSpeed;
    c.onGround = false;
    c.airTime = P.coyoteTime; // no double jump via coyote time
    jumped = true;
    if (cmd.jump && c.kind === 'player') {
      // Jump held: the first hop starts a chain at the current speed, every hop after it speeds up.
      const sp = Math.hypot(c.vel.x, c.vel.z);
      if (c.hopSpeed > 0 && sp > 1e-3) {
        const target = sp * P.hopBoost;
        c.vel.x *= target / sp;
        c.vel.z *= target / sp;
        c.hopSpeed = target;
      } else {
        c.hopSpeed = sp;
      }
    }
  } else if (c.mantleBuffer > 0 && !canJump) {
    const ledge = findMantle(c, world, c.onGround ? P.mantleMin : P.mantleMinAir);
    if (ledge) {
      c.jumpBuffer = 0;
      c.mantleBuffer = 0;
      c.slideTime = 0;
      c.hopSpeed = 0;
      c.mantle = { from: { ...c.pos }, to: ledge, crouch: ledge.crouch, t: 0, dur: 0.25 + ledge.rise * 0.1 };
      c.vel.x = c.vel.y = c.vel.z = 0;
      stepMantle(c, dt);
      return;
    }
  }
  if (c.onGround && !jumped) c.hopSpeed = 0; // stayed on the ground: the chain is over
  c.vel.y = Math.max(c.vel.y - P.gravity * dt, -P.maxFall);

  const wasOnGround = c.onGround;
  const step = wasOnGround ? P.stepHeight : 0.05;
  const h = characterHeight(c);

  // Horizontal move + wall collision, in short steps when moving fast so walls can't be skipped.
  const edge = world.terrain.size / 2 - P.radius;
  const steps = Math.max(1, Math.ceil((Math.hypot(c.vel.x, c.vel.z) * dt) / P.maxSubstep));
  for (let i = 0; i < steps; i++) {
    c.pos.x += (c.vel.x * dt) / steps;
    c.pos.z += (c.vel.z * dt) / steps;
    if (c.pos.x < -edge || c.pos.x > edge) {
      c.pos.x = clamp(c.pos.x, -edge, edge);
      c.vel.x = 0;
    }
    if (c.pos.z < -edge || c.pos.z > edge) {
      c.pos.z = clamp(c.pos.z, -edge, edge);
      c.vel.z = 0;
    }
    resolveHorizontal(c, world, step);
  }
  if (c.hopSpeed > 0) {
    // Walls take the speed away: grazing one keeps what's left, hitting one ends the chain.
    const left = Math.hypot(c.vel.x, c.vel.z);
    c.hopSpeed = left < c.hopSpeed * 0.5 ? 0 : Math.min(c.hopSpeed, left);
  }

  // Vertical move: find the ground (terrain or a box top) and any ceiling.
  const yBefore = c.pos.y;
  const vyBefore = c.vel.y;
  c.pos.y += c.vel.y * dt;
  let ground = world.terrain.heightAt(c.pos.x, c.pos.z);
  let ceiling = Infinity;
  for (const b of queryAround(world, c.pos.x, c.pos.z, P.radius)) {
    if (!circleOverlapsBox(c.pos.x, c.pos.z, P.radius * 0.95, b)) continue;
    if (b.maxY <= yBefore + step + 1e-6) {
      if (b.maxY > ground) ground = b.maxY;
    } else if (b.minY >= yBefore + h - 1e-6) {
      if (b.minY < ceiling) ceiling = b.minY;
    }
  }
  if (c.pos.y + h > ceiling) {
    c.pos.y = ceiling - h;
    if (c.vel.y > 0) c.vel.y = 0;
  }
  if (c.pos.y <= ground) {
    c.pos.y = ground;
    if (c.vel.y < 0) c.vel.y = 0;
    if (!wasOnGround && vyBefore < -P.fallSafeSpeed) {
      const dmg = Math.round((-vyBefore - P.fallSafeSpeed) * P.fallDamagePerSpeed);
      dealDamage(null, c, dmg, { bypassShield: true, weapon: 'fall', point: { x: c.pos.x, y: c.pos.y + 0.2, z: c.pos.z } }, events);
    }
    c.onGround = true;
  } else if (wasOnGround && c.vel.y <= 0 && c.pos.y - ground <= P.snapDown) {
    // Stick to the ground when walking down slopes and small steps.
    c.pos.y = ground;
    c.vel.y = 0;
    c.onGround = true;
  } else {
    c.onGround = false;
  }
  c.airTime = c.onGround ? 0 : c.airTime + dt;

  c.speed = Math.hypot(c.vel.x, c.vel.z);
}

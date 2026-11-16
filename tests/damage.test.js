import test from 'node:test';
import assert from 'node:assert/strict';
import { applyDamage, dealDamage } from '../js/sim/damage.js';

const target = (health = 100, shield = 0) => ({
  id: 2, health, shield, alive: true, stats: { kills: 0, damageDealt: 0 },
});

test('shield absorbs damage first, the rest goes to health', () => {
  const t = target(100, 25);
  const r = applyDamage(t, 40);
  assert.deepEqual(r, { shieldDamage: 25, healthDamage: 15, killed: false });
  assert.equal(t.shield, 0);
  assert.equal(t.health, 85);
});

test('damage smaller than shield leaves health alone', () => {
  const t = target(100, 150);
  applyDamage(t, 32);
  assert.equal(t.shield, 118);
  assert.equal(t.health, 100);
});

test('bypassShield skips the shield', () => {
  const t = target(100, 150);
  const r = applyDamage(t, 10, { bypassShield: true });
  assert.equal(r.shieldDamage, 0);
  assert.equal(t.shield, 150);
  assert.equal(t.health, 90);
});

test('health never goes negative and killed is true only on the lethal hit', () => {
  const t = target(20, 0);
  const r1 = applyDamage(t, 50);
  assert.equal(r1.healthDamage, 20);
  assert.equal(r1.killed, true);
  assert.equal(t.health, 0);
  assert.equal(t.alive, false);
  const r2 = applyDamage(t, 50);
  assert.deepEqual(r2, { shieldDamage: 0, healthDamage: 0, killed: false });
});

test('dealDamage emits hit and kill events and credits the attacker', () => {
  const attacker = { id: 1, stats: { kills: 0, damageDealt: 0 } };
  const t = target(30, 10);
  const events = [];
  dealDamage(attacker, t, 50, { weapon: 'ar', headshot: true, point: { x: 0, y: 1, z: 0 } }, events);
  assert.equal(events.length, 2);
  assert.equal(events[0].type, 'hit');
  assert.equal(events[0].shieldDamage, 10);
  assert.equal(events[0].healthDamage, 30);
  assert.equal(events[0].headshot, true);
  assert.equal(events[0].killed, true);
  assert.deepEqual(events[1], { type: 'kill', killerId: 1, victimId: 2, weapon: 'ar' });
  assert.equal(attacker.stats.kills, 1);
  assert.equal(attacker.stats.damageDealt, 40);
});

// Damage rules: shield absorbs damage first, then health.

export function applyDamage(target, amount, { bypassShield = false } = {}) {
  if (!target.alive || amount <= 0) return { shieldDamage: 0, healthDamage: 0, killed: false };
  let left = amount;
  let shieldDamage = 0;
  if (!bypassShield && target.shield > 0) {
    shieldDamage = Math.min(target.shield, left);
    target.shield -= shieldDamage;
    left -= shieldDamage;
  }
  const healthDamage = Math.min(target.health, left);
  target.health -= healthDamage;
  const killed = target.health <= 0;
  if (killed) {
    target.health = 0;
    target.alive = false;
  }
  return { shieldDamage, healthDamage, killed };
}

/**
 * Apply damage from an attacker (or null for the world) and emit events.
 * info: { weapon?, headshot?, point?, bypassShield? }
 */
export function dealDamage(attacker, target, amount, info, events) {
  const res = applyDamage(target, amount, info);
  const total = res.shieldDamage + res.healthDamage;
  if (attacker && attacker !== target) attacker.stats.damageDealt += total;
  events.push({
    type: 'hit',
    attackerId: attacker ? attacker.id : null,
    targetId: target.id,
    point: info.point || null,
    shieldDamage: res.shieldDamage,
    healthDamage: res.healthDamage,
    headshot: !!info.headshot,
    killed: res.killed,
    shieldBroken: res.shieldDamage > 0 && target.shield === 0,
  });
  if (res.killed) {
    if (attacker && attacker !== target) attacker.stats.kills++;
    events.push({
      type: 'kill',
      killerId: attacker ? attacker.id : null,
      victimId: target.id,
      weapon: info.weapon ?? null,
    });
  }
  return res;
}

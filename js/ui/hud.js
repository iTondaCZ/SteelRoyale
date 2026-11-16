// HTML/CSS heads-up display.
import { WEAPONS, RARITY, PLAYER, CONSUMABLES, AMMO } from '../config.js';
import { spreadDeg, reloadDuration } from '../sim/weapons.js';
import { itemLabel } from '../sim/inventory.js';
import { angleDiff } from '../sim/vec.js';
import { renderMapImage, worldToMap } from './map-image.js';
import { isInside } from '../sim/zone.js';

const MINIMAP_RANGE = 110; // metres from the centre to the edge of the minimap

export function createHud() {
  const $ = (s) => document.querySelector(s);
  const el = {
    hud: $('#hud'),
    fps: $('#fps'),
    killfeed: $('#killfeed'),
    toasts: $('#toasts'),
    crosshair: $('#crosshair'),
    hitmarker: $('#hitmarker'),
    numbers: $('#damage-numbers'),
    dirs: $('#damage-dirs'),
    vignette: $('#vignette'),
    scope: $('#scope'),
    shieldFill: $('#vitals .shield .fill'),
    shieldVal: $('#vitals .shield .val'),
    healthFill: $('#vitals .health .fill'),
    healthVal: $('#vitals .health .val'),
    weaponPanel: $('#weapon-panel'),
    weaponName: $('#weapon-panel .name'),
    ammo: $('#weapon-panel .ammo'),
    mag: $('#weapon-panel .mag'),
    reserve: $('#weapon-panel .reserve'),
    reload: $('#weapon-panel .reload'),
    reloadFill: $('#weapon-panel .reload .fill'),
    prompt: $('#prompt'),
    promptText: $('#prompt .text'),
    useBar: $('#use-bar'),
    useLabel: $('#use-bar .label'),
    useFill: $('#use-bar .fill'),
    minimap: $('#minimap'),
    alive: $('#alive-count'),
    kills: $('#kill-count'),
    fullmap: $('#fullmap'),
    fullCanvas: $('#fullmap canvas'),
    stormTimer: $('#storm-timer'),
    stormWarning: $('#storm-warning'),
  };


  // Only touch the DOM when a value actually changes.
  const last = new Map();
  const changed = (key, value) => {
    if (last.get(key) === value) return false;
    last.set(key, value);
    return true;
  };

  const numbers = [];
  const arcs = [];
  let hitTimer = 0;
  let fpsTime = 0;
  let fpsFrames = 0;
  let mapImage = null;
  let mapRef = null;
  let fullOpen = false;
  const mctx = el.minimap.getContext('2d');
  const fctx = el.fullCanvas.getContext('2d');

  function toast(text, warn = false) {
    const t = document.createElement('div');
    t.className = `toast${warn ? ' warn' : ''}`;
    t.textContent = text;
    el.toasts.appendChild(t);
    while (el.toasts.children.length > 5) el.toasts.firstChild.remove();
    setTimeout(() => {
      t.style.opacity = '0';
      setTimeout(() => t.remove(), 450);
    }, 2200);
  }

  function showHitmarker(e) {
    const m = el.hitmarker;
    m.classList.remove('show', 'head', 'kill');
    void m.offsetWidth;
    m.classList.add('show');
    if (e.killed) m.classList.add('kill');
    else if (e.headshot) m.classList.add('head');
    hitTimer = 0.09;
  }

  function addDamageNumber(e) {
    const total = e.shieldDamage + e.healthDamage;
    if (total <= 0 || !e.point) return;
    const node = document.createElement('div');
    node.className = 'dmg';
    if (e.headshot) node.classList.add('head');
    else if (e.healthDamage === 0) node.classList.add('shield');
    node.textContent = String(Math.round(total));
    el.numbers.appendChild(node);
    numbers.push({ node, point: { ...e.point }, age: 0, drift: (Math.random() - 0.5) * 40 });
  }

  function addDamageArc(game, e) {
    const attacker = e.attackerId != null ? game.world.characters.get(e.attackerId) : null;
    if (!attacker) return;
    const node = document.createElement('div');
    node.className = 'arc';
    el.dirs.appendChild(node);
    arcs.push({ node, x: attacker.pos.x, z: attacker.pos.z, age: 0 });
    if (arcs.length > 6) arcs.shift().node.remove();
  }

  function addKill(e, game) {
    const killer = e.killerId != null ? game.world.characters.get(e.killerId) : null;
    const victim = game.world.characters.get(e.victimId);
    const row = document.createElement('div');
    row.className = 'entry';
    const name = (c) => {
      const b = document.createElement('b');
      b.textContent = c ? c.name : '';
      if (c && c.kind === 'player') b.classList.add('you');
      return b;
    };
    if (killer && killer !== victim) row.append(name(killer), document.createTextNode(' eliminated '), name(victim));
    else row.append(name(victim), document.createTextNode(e.weapon === 'fall' ? ' fell too far' : e.weapon === 'zone' ? ' was eliminated by the storm' : ' was eliminated'));
    if (killer && e.weapon && WEAPONS[e.weapon]) {
      const w = document.createElement('span');
      w.className = 'weapon';
      w.textContent = ` · ${WEAPONS[e.weapon].name}`;
      row.append(w);
    }
    el.killfeed.prepend(row);
    while (el.killfeed.children.length > 5) el.killfeed.lastChild.remove();
    setTimeout(() => {
      row.style.opacity = '0';
      setTimeout(() => row.remove(), 450);
    }, 5000);
  }

  /** Shade the storm, outline its edge, dash the next safe circle. toPx(x, z) → {x, y}; scale = px per metre. */
  function drawStorm(ctx, zone, toPx, scale, W, H, player) {
    if (!zone) return;
    const cur = toPx(zone.current.x, zone.current.z);
    const next = toPx(zone.target.x, zone.target.z);
    const r = Math.max(0, zone.current.r * scale);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.arc(cur.x, cur.y, r, 0, Math.PI * 2, true);
    ctx.fillStyle = 'rgba(130, 45, 200, 0.38)';
    ctx.fill('evenodd');
    ctx.beginPath();
    ctx.arc(cur.x, cur.y, r, 0, Math.PI * 2);
    ctx.strokeStyle = '#d16bff';
    ctx.lineWidth = 2;
    ctx.stroke();
    if (zone.stage !== 'done') {
      ctx.beginPath();
      ctx.arc(next.x, next.y, Math.max(1, zone.target.r * scale), 0, Math.PI * 2);
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // Guide line to safety when outside the next circle
    if (player && !isInside(zone.target, player.pos.x, player.pos.z)) {
      const p = toPx(player.pos.x, player.pos.z);
      const dx = zone.target.x - player.pos.x;
      const dz = zone.target.z - player.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      const edge = toPx(zone.target.x - (dx / d) * zone.target.r, zone.target.z - (dz / d) * zone.target.r);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(edge.x, edge.y);
      ctx.setLineDash([3, 4]);
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  }

  function drawMinimap(game, yaw) {
    if (!mapImage) return;
    const p = game.player.pos;
    const W = el.minimap.width;
    const scale = mapImage.width / game.map.terrain.size;
    const src = MINIMAP_RANGE * 2 * scale;
    const c = worldToMap(game.map, p.x, p.z, mapImage.width);
    mctx.save();
    mctx.clearRect(0, 0, W, W);
    mctx.beginPath();
    mctx.arc(W / 2, W / 2, W / 2, 0, Math.PI * 2);
    mctx.clip();
    mctx.fillStyle = '#2f7fa8';
    mctx.fillRect(0, 0, W, W);
    mctx.imageSmoothingEnabled = true;
    mctx.drawImage(mapImage, c.x - src / 2, c.y - src / 2, src, src, 0, 0, W, W);
    const mmScale = W / 2 / MINIMAP_RANGE;
    drawStorm(mctx, game.zone, (x, z) => ({ x: W / 2 + (x - p.x) * mmScale, y: W / 2 + (z - p.z) * mmScale }), mmScale, W, W, game.player);
    // Place names in range
    mctx.font = '600 11px Bahnschrift, Arial Narrow, sans-serif';
    mctx.textAlign = 'center';
    for (const place of game.map.places || []) {
      const dx = place.x - p.x;
      const dz = place.z - p.z;
      if (Math.abs(dx) > MINIMAP_RANGE || Math.abs(dz) > MINIMAP_RANGE) continue;
      const x = W / 2 + (dx / MINIMAP_RANGE) * (W / 2);
      const y = W / 2 + (dz / MINIMAP_RANGE) * (W / 2);
      mctx.fillStyle = '#000a';
      mctx.fillText(place.name, x + 1, y + 1);
      mctx.fillStyle = '#fff';
      mctx.fillText(place.name, x, y);
    }
    // Player arrow (north-up map)
    drawArrow(mctx, W / 2, W / 2, yaw, 9);
    mctx.restore();
  }

  function drawArrow(ctx, x, y, yaw, size) {
    // yaw 0 faces −Z, which is "up" on the map; positive yaw turns left (counter-clockwise).
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-yaw);
    ctx.beginPath();
    ctx.moveTo(0, -size);
    ctx.lineTo(size * 0.7, size * 0.8);
    ctx.lineTo(0, size * 0.35);
    ctx.lineTo(-size * 0.7, size * 0.8);
    ctx.closePath();
    ctx.fillStyle = '#ff7a1a';
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 2;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function drawFullMap(game, yaw) {
    const W = el.fullCanvas.width;
    fctx.drawImage(mapImage, 0, 0, W, W);
    drawStorm(fctx, game.zone, (x, z) => worldToMap(game.map, x, z, W), W / game.map.terrain.size, W, W, game.player);
    fctx.font = '700 15px Bahnschrift, Arial Narrow, sans-serif';
    fctx.textAlign = 'center';
    for (const place of game.map.places || []) {
      const m = worldToMap(game.map, place.x, place.z, W);
      fctx.fillStyle = '#000b';
      fctx.fillText(place.name.toUpperCase(), m.x + 1, m.y + 1);
      fctx.fillStyle = '#fff';
      fctx.fillText(place.name.toUpperCase(), m.x, m.y);
    }
    const p = worldToMap(game.map, game.player.pos.x, game.player.pos.z, W);
    drawArrow(fctx, p.x, p.y, yaw, 11);
  }

  return {
    show(visible) {
      el.hud.classList.toggle('hidden', !visible);
    },

    setMap(map) {
      mapRef = map;
      mapImage = renderMapImage(map, 1024);
      el.minimap.parentElement.style.display = '';
    },

    toggleFullMap(force) {
      fullOpen = force !== undefined ? force : !fullOpen;
      el.fullmap.classList.toggle('hidden', !fullOpen || !mapImage);
    },

    onEvents(events, game) {
      const pid = game.player.id;
      for (const e of events) {
        if (e.type === 'hit') {
          if (e.attackerId === pid && e.targetId !== pid) {
            showHitmarker(e);
            addDamageNumber(e);
          } else if (e.targetId === pid && e.attackerId != null) {
            addDamageArc(game, e);
          }
        } else if (e.type === 'kill') {
          addKill(e, game);
        } else if (e.type === 'pickup' && e.id === pid) {
          toast(`+ ${itemLabel(e.item)}`);
        } else if (e.type === 'useDenied' && e.id === pid) {
          toast(e.reason, true);
        }
      }
    },

    /** project(point) → { x, y, visible } in CSS pixels. */
    update(game, dt, project, fovDeg, viewHeight, yaw) {
      const p = game.player;

      // Vitals
      if (changed('shield', p.shield)) {
        el.shieldFill.style.transform = `scaleX(${p.shield / PLAYER.maxShield})`;
        el.shieldVal.textContent = String(Math.ceil(p.shield));
      }
      if (changed('health', p.health)) {
        el.healthFill.style.transform = `scaleX(${p.health / PLAYER.maxHealth})`;
        el.healthVal.textContent = String(Math.ceil(p.health));
        el.vignette.style.opacity = p.health < 35 ? String(0.35 + (35 - p.health) / 50) : '0';
      }

      const inv = p.inventory; // (the hotbar and ammo are drawn by ui/inventory.js)

      // Weapon panel
      const w = p.weapon;
      if (changed('hasWeapon', !!w)) el.weaponPanel.classList.toggle('hidden-soft', !w);
      if (w) {
        const def = WEAPONS[w.type];
        const rarity = RARITY[w.rarity];
        if (changed('weapon', w.type + w.rarity)) {
          el.weaponName.textContent = `${rarity.name} ${def.name}`;
          el.weaponPanel.style.setProperty('--rarity', rarity.color);
        }
        if (changed('mag', w.mag)) {
          el.mag.textContent = String(w.mag);
          el.ammo.classList.toggle('empty', w.mag === 0);
        }
        const reserve = p.ammo[def.ammo] || 0;
        if (changed('reserve', reserve)) el.reserve.textContent = String(reserve);
        const reloading = w.reloadLeft > 0;
        if (changed('reloading', reloading)) el.reload.classList.toggle('active', reloading);
        if (reloading) el.reloadFill.style.transform = `scaleX(${1 - w.reloadLeft / reloadDuration(def, w.rarity)})`;

        const spread = (spreadDeg(p) * Math.PI) / 180;
        const fov = (fovDeg * Math.PI) / 180;
        const gap = Math.max(3, Math.round((Math.tan(spread) / Math.tan(fov / 2)) * (viewHeight / 2)));
        if (changed('gap', gap)) el.crosshair.style.setProperty('--gap', `${gap}px`);
      }
      const scoped = !!(w && w.type === 'sniper' && p.aiming && p.alive);
      if (changed('scoped', scoped)) {
        el.scope.classList.toggle('hidden', !scoped);
        el.crosshair.style.visibility = scoped ? 'hidden' : '';
      }

      // Interaction prompt
      let verb = '';
      let noun = '';
      let nounColor = '';
      if (p.alive && p.focus) {
        if (p.focus.kind === 'chest') {
          const chest = game.world.loot.chests[p.focus.id - 1];
          verb = 'Open';
          noun = chest.vault ? 'Steel Vault' : 'Chest';
          if (chest.vault) nounColor = RARITY.legendary.color;
        } else {
          const loot = game.world.loot.items.get(p.focus.id);
          if (loot) {
            const item = loot.item;
            nounColor = item.kind === 'weapon' ? RARITY[item.rarity].color : item.kind === 'consumable' ? CONSUMABLES[item.type].color : AMMO[item.ammoType].color;
            const full = !inv.slots.includes(null) && item.kind !== 'ammo' && !(item.kind === 'consumable' && inv.slots.some((s) => s && s.kind === 'consumable' && s.type === item.type && s.count < CONSUMABLES[s.type].stack));
            verb = full ? 'Swap for' : 'Pick up';
            noun = itemLabel(item);
          }
        }
      }
      if (changed('prompt', verb + noun)) {
        el.prompt.classList.toggle('hidden', !verb);
        const b = document.createElement('b');
        b.textContent = noun;
        if (nounColor) b.style.color = nounColor;
        el.promptText.replaceChildren(document.createTextNode(`${verb} `), b);
      }

      // Item use progress
      const using = p.useItem;
      if (changed('using', using ? using.type : '')) {
        el.useBar.classList.toggle('hidden', !using);
        if (using) el.useLabel.textContent = `Using ${CONSUMABLES[using.type].name}`;
      }
      if (using) el.useFill.style.transform = `scaleX(${1 - using.left / using.total})`;

      // Match info
      if (game.mode === 'match') {
        if (changed('alive', game.alive)) el.alive.textContent = `${game.alive} alive`;
        if (changed('kills', p.stats.kills)) el.kills.textContent = `${p.stats.kills} kills`;
      } else if (changed('alive', 'training')) {
        el.alive.textContent = 'Training';
        el.kills.textContent = `${p.stats.kills} kills`;
      }
      if (changed('kills2', p.stats.kills)) el.kills.textContent = `${p.stats.kills} kills`;

      // Storm: countdown, and a tint + warning while you're in it
      const zone = game.zone;
      if (zone) {
        const secs = Math.max(0, Math.ceil(zone.timer));
        const clock = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
        const phase = `${zone.phase + 1}/${zone.phases.length}`;
        const text = zone.stage === 'done' ? 'Final circle' : zone.stage === 'shrink' ? `Storm closing · ${clock}` : `Storm closes in ${clock} · phase ${phase}`;
        if (changed('stormText', text)) el.stormTimer.textContent = text;
        if (changed('stormStage', zone.stage)) {
          el.stormTimer.classList.remove('hidden');
          el.stormTimer.classList.toggle('closing', zone.stage !== 'wait');
        }
        const inStorm = p.alive && !isInside(zone.current, p.pos.x, p.pos.z);
        if (changed('inStorm', inStorm)) {
          el.hud.classList.toggle('in-storm', inStorm);
          el.stormWarning.classList.toggle('hidden', !inStorm);
        }
        if (inStorm && changed('stormDps', zone.dps)) el.stormWarning.textContent = `In the storm · −${zone.dps} HP/s · get to the safe zone`;
      } else if (changed('stormStage', 'none')) {
        el.stormTimer.classList.add('hidden');
      }

      // Hit marker fade
      if (hitTimer > 0) {
        hitTimer -= dt;
        if (hitTimer <= 0) el.hitmarker.classList.remove('show');
      }

      // Damage direction arcs, relative to where we're looking
      for (let i = arcs.length - 1; i >= 0; i--) {
        const a = arcs[i];
        a.age += dt;
        if (a.age > 1.2) {
          a.node.remove();
          arcs.splice(i, 1);
          continue;
        }
        const toward = Math.atan2(-(a.x - p.pos.x), -(a.z - p.pos.z));
        const rel = angleDiff(yaw, toward); // + = to the left
        a.node.style.transform = `rotate(${-rel}rad)`;
        a.node.style.opacity = String(1 - a.age / 1.2);
      }

      // Floating damage numbers
      for (let i = numbers.length - 1; i >= 0; i--) {
        const n = numbers[i];
        n.age += dt;
        if (n.age > 0.9) {
          n.node.remove();
          numbers.splice(i, 1);
          continue;
        }
        const s = project({ x: n.point.x, y: n.point.y + 0.4 + n.age * 0.9, z: n.point.z });
        if (!s.visible) {
          n.node.style.opacity = '0';
          continue;
        }
        const pop = n.age < 0.08 ? 1.35 - n.age * 4 : 1;
        n.node.style.opacity = String(n.age < 0.55 ? 1 : 1 - (n.age - 0.55) / 0.35);
        n.node.style.transform = `translate(${s.x + n.drift * n.age}px, ${s.y}px) translate(-50%, -50%) scale(${pop})`;
      }

      // Maps
      if (mapImage && mapRef === game.map) {
        drawMinimap(game, yaw);
        if (fullOpen) drawFullMap(game, yaw);
      }

      // FPS
      fpsTime += dt;
      fpsFrames++;
      if (fpsTime >= 0.5) {
        el.fps.textContent = `${Math.round(fpsFrames / fpsTime)} FPS`;
        fpsTime = 0;
        fpsFrames = 0;
      }
    },
  };
}

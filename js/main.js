// Boot: menu → build a match (or the training range) → input → simulation → rendering/UI.
import * as THREE from 'three';
import { TICK_DT, WEAPONS, MATCH } from './config.js';
import { createGame } from './sim/game.js';
import { lerp } from './sim/vec.js';
import { stepsForFrame } from './loop.js';
import { createRenderer } from './render/renderer.js';
import { createTerrainMesh } from './render/terrain-mesh.js';
import { createWorldMeshes } from './render/world-meshes.js';
import { createCrowd } from './render/crowd.js';
import { createLootView } from './render/loot-view.js';
import { createCameraRig } from './render/camera-rig.js';
import { createEffects } from './render/effects.js';
import { createStormView } from './render/storm.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createHud } from './ui/hud.js';
import { createInventoryUI } from './ui/inventory.js';
import { createHoldToggle } from './hold-toggle.js';

const $ = (s) => document.querySelector(s);
const container = $('#game');
const overlay = $('#overlay');
const overlaySub = $('#overlay-sub');
const menu = $('#menu');
const playBtn = $('#play');
const trainingBtn = $('#training');
const loading = $('#loading');
const endscreen = $('#endscreen');
const modeHint = $('#mode-hint');

// ---------- Settings (URL first, then remembered choices) ----------
const params = new URLSearchParams(location.search);
const stored = (() => {
  try {
    return JSON.parse(localStorage.getItem('steelroyale.settings') || '{}');
  } catch {
    return {};
  }
})();
const settings = {
  players: MATCH.playerCounts.includes(Number(params.get('players'))) ? Number(params.get('players')) : stored.players || 100,
  difficulty: ['easy', 'normal', 'hard'].includes(params.get('difficulty')) ? params.get('difficulty') : stored.difficulty || 'normal',
};
const saveSettings = () => {
  try {
    localStorage.setItem('steelroyale.settings', JSON.stringify(settings));
  } catch {
    /* private mode: fine, just not remembered */
  }
};
for (const seg of document.querySelectorAll('.seg')) {
  const name = seg.dataset.name;
  const mark = () => seg.querySelectorAll('button').forEach((b) => b.classList.toggle('active', String(settings[name]) === b.dataset.value));
  seg.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    settings[name] = name === 'players' ? Number(b.dataset.value) : b.dataset.value;
    saveSettings();
    mark();
  });
  mark();
}
const urlFor = (mode) => `?mode=${mode}&players=${settings.players}&difficulty=${settings.difficulty}&auto=1`;

// Ctrl is the crouch key, and the browser's Ctrl+W ("close tab") can't be blocked by a page.
// So while a game is running, ask before the page goes away. The game's own buttons skip the question.
let leaving = false;
const leavePage = (url) => {
  leaving = true;
  location.href = url;
};
window.addEventListener('beforeunload', (e) => {
  if (leaving || !session || !session.started || session.ended) return;
  e.preventDefault();
  e.returnValue = ''; // older browsers need this to show the "Leave site?" dialog
});

// ---------- Shared systems ----------
const view = createRenderer(container);
const input = createInput(view.renderer.domElement);
const audio = createAudio();
const hud = createHud();
// The hotbar doubles as the inventory: hold Tab and it grows on the right side, editable.
const inventoryUI = createInventoryUI({
  loadout: $('#loadout'),
  hotbar: $('#hotbar'),
  reserves: $('#ammo-reserves'),
  hud: $('#hud'),
  onOp: (op) => input.queueInventoryOp(op),
});
// M: tap to keep the map open, or hold it open (see hold-toggle.js).
const mapToggle = createHoldToggle({
  threshold: 0.75,
  onOpen: () => hud.toggleFullMap(true),
  onClose: () => hud.toggleFullMap(false),
});
const closeMap = () => {
  mapToggle.forceClose();
  hud.toggleFullMap(false);
};
input.onMenuChange((open) => {
  inventoryUI.setOpen(open);
  if (open) closeMap();
});
let session = null;

function buildSession(mode) {
  const seed = mode === 'match' ? Math.floor(Math.random() * 1e9) : 7;
  const game = createGame({ mode, seed, players: settings.players, difficulty: settings.difficulty });
  const { map } = game;
  const surfaceAt = map.surface ? (i, j) => map.surface[j * map.terrain.cols + i] : trainingSurface(map);
  view.scene.add(createTerrainMesh(map.terrain, { surfaceAt, waterLevel: map.waterLevel }));
  const worldView = createWorldMeshes(view.scene, map);
  const crowd = createCrowd(view.scene);
  const lootView = createLootView(view.scene);
  const fx = createEffects(view.scene);
  const rig = createCameraRig(view.camera, game.world);
  const storm = game.zone ? createStormView(view.scene) : null;
  input.yaw = game.player.yaw;
  input.pitch = 0;
  hud.setMap(map);
  return { game, worldView, crowd, lootView, fx, rig, storm, ended: false, endShownAt: null };
}

/** The training range paints gravel on the firing lane and dirt around houses. */
function trainingSurface(map) {
  const r = map.range;
  return (i, j, x, z) => {
    if (Math.abs(x - r.x) < r.w / 2 && Math.abs(z - r.z) < r.d / 2) return 5;
    for (const b of map.buildings) if (Math.abs(x - b.x) < b.w / 2 + 3 && Math.abs(z - b.z) < b.d / 2 + 3) return 2;
    return 0;
  };
}

/** Let the browser paint once (e.g. "Generating…"); falls back to a timer if the tab isn't animating. */
const nextFrame = () =>
  new Promise((resolve) => {
    let done = false;
    const go = () => {
      if (done) return;
      done = true;
      setTimeout(resolve, 0);
    };
    requestAnimationFrame(go);
    setTimeout(go, 80);
  });

async function ensureSession(mode) {
  if (session && session.game.mode === mode) return true;
  if (session) {
    // Switching modes: start fresh on a clean page.
    leavePage(urlFor(mode));
    return false;
  }
  loading.textContent = mode === 'match' ? 'Generating the island…' : 'Building the range…';
  playBtn.disabled = true;
  trainingBtn.disabled = true;
  await nextFrame();
  session = buildSession(mode);
  loading.textContent = '';
  playBtn.disabled = false;
  trainingBtn.disabled = false;
  return true;
}

async function startPlaying(mode) {
  audio.unlock();
  if (!(await ensureSession(mode))) return;
  const result = await input.start();
  if (result === 'paused') overlaySub.textContent = 'Click again to resume';
}

playBtn.addEventListener('click', () => startPlaying(session ? session.game.mode : 'match'));
trainingBtn.addEventListener('click', () => {
  if (session) leavePage(location.pathname); // acts as "Main menu" while paused
  else startPlaying('training');
});
$('#again').addEventListener('click', () => leavePage(urlFor(session ? session.game.mode : 'match')));
$('#to-menu').addEventListener('click', () => leavePage(location.pathname));

input.onActiveChange((active, mode) => {
  if (session && session.ended) return; // the end screen owns the screen now
  overlay.classList.toggle('hidden', active);
  hud.show(!!session);
  if (active) {
    session.started = true;
    menu.classList.add('hidden');
    modeHint.classList.toggle('hidden', mode !== 'free');
  } else if (session) {
    closeMap();
    overlaySub.textContent = 'Paused';
    playBtn.textContent = 'Resume';
    trainingBtn.textContent = 'Main menu';
  }
});
input.onKeyUp((code) => {
  if (code === 'KeyM' || code === null) mapToggle.release(performance.now() / 1000);
});
input.onKey((code) => {
  // (Tab is handled by input itself, with the same tap-or-hold behaviour.)
  if (code === 'KeyM' && session && !input.menuOpen) mapToggle.press(performance.now() / 1000);
});

// ---------- Events → effects & sound ----------
const camPos = new THREE.Vector3();
const volumeAt = (p) => {
  if (!p) return 0;
  const d = Math.hypot(p.x - camPos.x, p.y - camPos.y, p.z - camPos.z);
  return d > 240 ? 0 : 1 / (1 + d / 18);
};

function handleEvents(events) {
  const { game, fx, crowd, worldView } = session;
  const pid = game.player.id;
  for (const e of events) {
    switch (e.type) {
      case 'shot': {
        const muzzle = crowd.muzzleOf(e.shooterId) || e.from;
        const vol = e.shooterId === pid ? 1 : volumeAt(e.from) * 0.8;
        if (vol > 0.04 || e.shooterId === pid) {
          if (e.to) fx.tracer(muzzle, e.to);
          if (!e.pellet) fx.muzzleFlash(muzzle);
        }
        if (e.to && (e.hitKind === 'box' || e.hitKind === 'terrain') && volumeAt(e.to) > 0.05) fx.impact(e.to, 'world');
        if (!e.pellet && vol > 0.03) audio.shot(vol);
        break;
      }
      case 'impact':
        if (volumeAt(e.point) > 0.04) fx.impact(e.point, e.hitKind === 'character' ? 'flesh' : 'world');
        break;
      case 'hit':
        if (e.point && volumeAt(e.point) > 0.04) fx.impact(e.point, e.healthDamage === 0 ? 'shield' : 'flesh');
        if (e.attackerId === pid && e.targetId !== pid) audio.hit(e.headshot, e.healthDamage === 0);
        break;
      case 'explosion':
        fx.explosion(e.point, e.radius);
        audio.explosion(volumeAt(e.point));
        break;
      case 'kill':
        if (e.killerId === pid && e.victimId !== pid) audio.kill();
        break;
      case 'reload':
        if (e.id === pid) audio.reload();
        break;
      case 'pickup':
        if (e.id === pid) audio.pickup();
        break;
      case 'chestOpened':
        worldView.chests.opened(game.world.loot.chests[e.chestId - 1]);
        if (volumeAt(e) > 0.3) audio.chest(e.vault);
        break;
      default:
        break;
    }
  }
  hud.onEvents(events, game);
}

function showEndScreen(game) {
  const r = game.result;
  const won = game.state === 'won';
  endscreen.classList.toggle('won', won);
  $('#end-place').textContent = `#${r.placement}`;
  $('#end-title').textContent = won ? 'Steel Champion' : 'Eliminated';
  $('#end-by').textContent = won
    ? `Last one standing out of ${r.of}`
    : r.killer
      ? `by ${r.killer}${r.weapon && WEAPONS[r.weapon] ? ` · ${WEAPONS[r.weapon].name}` : ''}`
      : r.weapon === 'fall' ? 'by a long fall' : r.weapon === 'zone' ? 'by the storm' : '';
  $('#end-kills').textContent = String(r.kills);
  $('#end-damage').textContent = String(r.damage);
  const s = Math.floor(r.time);
  $('#end-time').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  endscreen.classList.remove('hidden');
  overlay.classList.add('hidden');
  closeMap();
}

// ---------- Frame loop ----------
const cmd = {};
const renderPositions = new Map();
const playerPos = { x: 0, y: 0, z: 0 };
const projected = new THREE.Vector3();
let accumulator = 0;
let lastTime = performance.now();
let alpha = 1;

function project(p) {
  projected.set(p.x, p.y, p.z).project(view.camera);
  return {
    x: ((projected.x + 1) / 2) * container.clientWidth,
    y: ((1 - projected.y) / 2) * container.clientHeight,
    visible: projected.z > -1 && projected.z < 1,
  };
}

function renderPos(c) {
  let p = renderPositions.get(c.id);
  if (!p) renderPositions.set(c.id, (p = { x: 0, y: 0, z: 0 }));
  p.x = lerp(c.prevPos.x, c.pos.x, alpha);
  p.y = lerp(c.prevPos.y, c.pos.y, alpha);
  p.z = lerp(c.prevPos.z, c.pos.z, alpha);
  return p;
}

const playerView = { yaw: 0, pitch: 0 };
const otherView = { yaw: 0, pitch: 0 };

function frame(now) {
  requestAnimationFrame(frame);
  update(now);
}

function update(now) {
  const dt = Math.min(0.1, Math.max(0, (now - lastTime) / 1000));
  lastTime = now;
  if (!session) {
    view.render();
    return;
  }
  const { game, crowd, lootView, fx, rig } = session;
  const player = game.player;

  if (input.active) {
    const r = stepsForFrame(accumulator, dt, TICK_DT);
    accumulator = r.accumulator;
    for (let i = 0; i < r.steps; i++) {
      input.sample(cmd);
      game.tick(cmd);
      input.clearLatches();
    }
  } else {
    accumulator = 0;
  }
  alpha = input.active ? accumulator / TICK_DT : 1;

  const pp = renderPos(player);
  playerPos.x = pp.x;
  playerPos.y = pp.y;
  playerPos.z = pp.z;

  playerView.yaw = input.yaw;
  playerView.pitch = input.pitch;
  const scopeFov = player.weapon && player.aiming && WEAPONS[player.weapon.type].scopeFov;
  const camDist = rig.update(playerPos, input.yaw, input.pitch, player.aiming && player.alive, dt, {
    crouching: player.crouching,
    scopeFov,
    sprinting: player.sprinting,
  });
  camPos.copy(view.camera.position);

  crowd.update(game.world.characters.values(), {
    renderPos,
    viewOf: (c) => {
      if (c === player) return playerView;
      otherView.yaw = c.yaw;
      otherView.pitch = c.pitch;
      return otherView;
    },
    hideId: camDist < 0.9 || scopeFov ? player.id : null,
    camPos,
    time: game.time,
    dt,
  });

  handleEvents(game.events.splice(0));
  fx.syncProjectiles(game.world.projectiles, dt);
  if (session.storm) session.storm.update(game.zone, performance.now() / 1000);
  lootView.update(game.world, camPos, performance.now() / 1000);

  view.follow(playerPos.x, playerPos.y, playerPos.z);
  fx.update(dt);
  hud.update(game, dt, project, view.camera.fov, container.clientHeight, input.yaw);
  inventoryUI.update(player);
  view.render();

  // End of the match for the player
  if (!session.ended && (game.state === 'eliminated' || game.state === 'won')) {
    session.ended = true;
    session.endShownAt = now + 1500;
  }
  if (session.endShownAt && now >= session.endShownAt) {
    session.endShownAt = null;
    input.pause();
    if (document.pointerLockElement) document.exitPointerLock();
    showEndScreen(game);
  }
}
requestAnimationFrame(frame);

// ---------- Ready ----------
if (params.get('auto') === '1') {
  const mode = params.get('mode') === 'training' ? 'training' : 'match';
  menu.classList.add('hidden');
  ensureSession(mode).then(() => {
    overlaySub.textContent = mode === 'match' ? `${settings.players} players · ${settings.difficulty} bots` : 'Training range';
    playBtn.textContent = 'Click to drop in';
    trainingBtn.textContent = 'Main menu';
    hud.show(false);
  });
} else {
  playBtn.disabled = false;
  trainingBtn.disabled = false;
}

// steel.update(t) runs one frame by hand (useful when the tab isn't animating).
window.steel = {
  get game() {
    return session && session.game;
  },
  get session() {
    return session;
  },
  input,
  view,
  THREE,
  update,
  startPlaying,
};

// Everything is set up (see js/boot.js for startup errors).
window.__steelReady = true;
loading.textContent = params.get('auto') === '1' ? loading.textContent : '';

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
import { createLobby } from './render/lobby.js';
import { createMenu } from './ui/menu.js';
import { loadSettings, saveSettings, slotPrefsOf } from './settings.js';

const $ = (s) => document.querySelector(s);
const container = $('#game');
const overlay = $('#overlay');
const endscreen = $('#endscreen');
const modeHint = $('#mode-hint');

// ---------- Settings (remembered in localStorage; the URL can pick players and difficulty) ----------
const params = new URLSearchParams(location.search);
const storage = (() => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
})();
let settings = loadSettings(storage);
if (MATCH.playerCounts.includes(Number(params.get('players')))) settings = { ...settings, players: Number(params.get('players')) };
if (['easy', 'normal', 'hard'].includes(params.get('difficulty'))) settings = { ...settings, difficulty: params.get('difficulty') };
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
const lobby = createLobby(view);
const BASE_SENSITIVITY = input.sensitivity;
let fpsLimit = 0;
let session = null;
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

/** Push the settings into every system (also mid-match, from the pause menu). */
function applySettings(s) {
  view.setQuality(s, [lobby.scene]);
  lobby.setShadows(s.shadows !== 'off');
  lobby.setSkin(s.skin);
  input.sensitivity = BASE_SENSITIVITY * s.sensitivity;
  input.aimSensitivity = s.aimSensitivity;
  input.invertY = s.invertY;
  audio.setVolume(s.volume);
  hud.showFps(s.showFps);
  fpsLimit = s.maxFps;
  if (session) {
    session.rig.setFov(s.fov);
    session.game.player.slotPrefs = slotPrefsOf(s);
  }
}

const menu = createMenu({
  root: overlay,
  settings,
  onChange: (s) => {
    settings = s;
    saveSettings(storage, s);
    applySettings(s);
  },
  onPlay: () => startPlaying('match'),
  onTraining: () => startPlaying('training'),
  onResume: () => startPlaying(session ? session.game.mode : 'match'),
  onMainMenu: () => leavePage(location.pathname),
});
applySettings(settings);

// Drag on the stage (right side of the main menu) to turn the character.
const stage = $('#stage-drag');
let dragX = null;
let dragT = 0;
stage.addEventListener('pointerdown', (e) => {
  dragX = e.clientX;
  dragT = performance.now();
  stage.setPointerCapture(e.pointerId);
  stage.classList.add('dragging');
});
stage.addEventListener('pointermove', (e) => {
  if (dragX === null) return;
  const now = performance.now();
  lobby.drag(e.clientX - dragX, (now - dragT) / 1000);
  dragX = e.clientX;
  dragT = now;
});
const endDrag = () => {
  dragX = null;
  lobby.release();
  stage.classList.remove('dragging');
};
stage.addEventListener('pointerup', endDrag);
stage.addEventListener('pointercancel', endDrag);

function buildSession(mode) {
  const seed = mode === 'match' ? Math.floor(Math.random() * 1e9) : 7;
  const game = createGame({ mode, seed, players: settings.players, difficulty: settings.difficulty, slotPrefs: slotPrefsOf(settings) });
  game.player.skin = settings.skin;
  const { map } = game;
  const surfaceAt = map.surface ? (i, j) => map.surface[j * map.terrain.cols + i] : trainingSurface(map);
  view.scene.add(createTerrainMesh(map.terrain, { surfaceAt, waterLevel: map.waterLevel }));
  const worldView = createWorldMeshes(view.scene, map);
  const crowd = createCrowd(view.scene);
  const lootView = createLootView(view.scene);
  const fx = createEffects(view.scene);
  const rig = createCameraRig(view.camera, game.world);
  rig.setFov(settings.fov);
  const groundAt = (x, z) => Math.max(map.terrain.heightAt(x, z), map.waterLevel ?? 0);
  const storm = game.zone ? createStormView(view, { groundAt }) : null;
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
  menu.setBusy(true, mode === 'match' ? 'Generating the island…' : 'Building the range…');
  await nextFrame();
  session = buildSession(mode);
  menu.setBusy(false);
  return true;
}

async function startPlaying(mode) {
  audio.unlock();
  if (!(await ensureSession(mode))) return;
  const result = await input.start();
  if (result === 'paused') menu.setContext('game', { title: 'Paused', sub: 'Click again to resume', action: 'Resume' });
}

/** What the pause screen says about the match. */
function matchStatus() {
  const g = session.game;
  return g.mode === 'match' ? `${g.alive} of ${g.totalPlayers} players left` : 'Training mode';
}

$('#again').addEventListener('click', () => leavePage(urlFor(session ? session.game.mode : 'match')));
$('#to-menu').addEventListener('click', () => leavePage(location.pathname));

input.onActiveChange((active, mode) => {
  if (session && session.ended) return; // the end screen owns the screen now
  overlay.classList.toggle('hidden', active);
  hud.show(!!session);
  if (active) {
    session.started = true;
    modeHint.classList.toggle('hidden', mode !== 'free');
  } else if (session) {
    closeMap();
    menu.setContext('game', { title: 'Paused', sub: matchStatus(), action: 'Resume' });
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

// Frame rate limit (setting): skip animation frames until the next one is due.
let lastDrawn = 0;
function frame(now) {
  requestAnimationFrame(frame);
  if (fpsLimit > 0) {
    const interval = 1000 / fpsLimit;
    const elapsed = now - lastDrawn;
    if (elapsed < interval - 1) return;
    lastDrawn = elapsed > interval * 2 ? now : lastDrawn + interval;
  }
  update(now);
}

function update(now) {
  const dt = Math.min(0.1, Math.max(0, (now - lastTime) / 1000));
  lastTime = now;
  if (!session) {
    // Main menu: the character on its turntable.
    lobby.update(dt);
    lobby.render(view.renderer);
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
    speed: player.speed,
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
  if (session.storm) session.storm.update(game.zone, performance.now() / 1000, camPos, dt);
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
  menu.setContext('game', mode === 'match'
    ? { title: 'Ready to drop', sub: '', action: 'Drop in' }
    : { title: 'Training mode', sub: '', action: 'Start' });
  ensureSession(mode).then(() => {
    const skill = { easy: 'low', normal: 'medium', hard: 'high' }[settings.difficulty];
    menu.setSub(mode === 'match' ? `${settings.players} players, ${skill} enemy skill` : 'Dummies, chests and every weapon to try.');
    hud.show(false);
  });
} else {
  menu.setBusy(false);
}

// steel.update(t) runs one frame by hand (useful when the tab isn't animating).
window.steel = {
  get game() {
    return session && session.game;
  },
  get session() {
    return session;
  },
  get settings() {
    return settings;
  },
  input,
  view,
  lobby,
  menu,
  THREE,
  update,
  startPlaying,
};

// Everything is set up (see js/boot.js for startup errors).
window.__steelReady = true;

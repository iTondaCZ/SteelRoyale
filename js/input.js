// Keyboard + mouse input → per-tick command objects.
//
// The game is "active" (receives input) in one of two modes:
//  - 'locked': pointer lock captures the mouse (normal browsers).
//  - 'free':   pointer lock is refused (e.g. embedded browser panes), so the
//              view turns with plain mouse movement and Esc pauses.
import { PLAYER } from './config.js';
import { createHoldToggle } from './hold-toggle.js';

const GAME_KEYS = new Set([
  'Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyR', 'KeyE', 'KeyG', 'KeyM', 'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'Tab',
  'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5',
]);
const SLOT_KEYS = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Digit5: 4 };
const MENU_KEY = 'Tab'; // tap: stays open until the next press · hold: open until released

export function createInput(element, { sensitivity = 0.0022, now = () => performance.now() / 1000 } = {}) {
  const keys = new Set();
  const buttons = new Set();
  const latches = { jump: false, reload: false, drop: false, slot: -1, slotDelta: 0, invOps: [] };
  const listeners = new Set();
  const keyListeners = new Set();
  const keyUpListeners = new Set();
  const menuListeners = new Set();
  let lockWorked = false;

  const input = {
    keys,
    buttons,
    yaw: 0,
    pitch: 0,
    sensitivity,
    /** Multiplier on mouse turning while right mouse (aim) is held. */
    aimSensitivity: 1,
    /** Mouse down looks up. */
    invertY: false,
    /** True while the game receives input. */
    active: false,
    /** 'locked' | 'free' | null */
    mode: null,
    /** Inventory menu open: the mouse is free for dragging, keys still move you. */
    menuOpen: false,

    /** fn(active, mode) runs whenever the game starts or pauses. */
    onActiveChange(fn) {
      listeners.add(fn);
    },
    /** fn(code) runs on key presses while playing (for UI keys like M). */
    onKey(fn) {
      keyListeners.add(fn);
    },
    /** fn(code) runs on every key release (so UI keys can tell a tap from a hold). */
    onKeyUp(fn) {
      keyUpListeners.add(fn);
    },
    /** fn(open) runs when the inventory menu opens or closes. */
    onMenuChange(fn) {
      menuListeners.add(fn);
    },

    /**
     * Start (or resume) playing. Resolves to 'locked', 'free', or 'paused'
     * ('paused' = the browser asked us to wait; clicking again will work).
     */
    async start() {
      if (input.active) return input.mode;
      const res = await acquireLock();
      if (res.ok) {
        lockWorked = true;
        setActive(true, 'locked');
        return 'locked';
      }
      // If pointer lock worked before, this failure is temporary (Chrome refuses a
      // new lock right after Esc, or after too many requests): stay paused, the
      // next click will work. If it never worked, this browser doesn't allow it.
      if (lockWorked) return 'paused';
      setActive(true, 'free');
      return 'free';
    },

    pause() {
      if (input.mode === 'locked' && document.pointerLockElement === element) document.exitPointerLock();
      else setActive(false, null);
    },

    /** Open the inventory menu: free the mouse, keep playing. */
    openMenu() {
      if (!input.active || input.menuOpen) return;
      setMenu(true);
      buttons.clear();
      if (input.mode === 'locked' && document.pointerLockElement === element) document.exitPointerLock();
    },

    /** Close the menu and capture the mouse again (call from a key press). Pauses if the browser refuses. */
    async closeMenu() {
      if (!input.menuOpen) return;
      setMenu(false);
      if (input.mode !== 'locked' || document.pointerLockElement === element) return;
      const res = await acquireLock();
      if (!res.ok) setActive(false, null);
    },

    /** Queue an inventory action from the menu ({ type: 'move' | 'drop' | 'dropAmmo', … }). */
    queueInventoryOp(op) {
      latches.invOps.push(op);
    },

    /** Command for the next simulation tick. Latched presses stay set until clearLatches(). */
    sample(out = {}) {
      out.moveX = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
      out.moveZ = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
      out.yaw = input.yaw;
      out.pitch = input.pitch;
      out.jump = latches.jump || keys.has('Space');
      out.sprint = keys.has('ShiftLeft') || keys.has('ShiftRight');
      out.crouch = keys.has('ControlLeft') || keys.has('ControlRight'); // hold to crouch
      out.fire = buttons.has(0);
      out.aim = buttons.has(2);
      out.reload = latches.reload;
      out.interact = keys.has('KeyE');
      out.drop = latches.drop;
      out.slot = latches.slot;
      out.slotDelta = latches.slotDelta;
      out.invOps = latches.invOps.length ? latches.invOps.slice() : null;
      return out;
    },
    clearLatches() {
      latches.jump = false;
      latches.reload = false;
      latches.drop = false;
      latches.slot = -1;
      latches.slotDelta = 0;
      latches.invOps.length = 0;
    },
    releaseAll() {
      keys.clear();
      buttons.clear();
      input.clearLatches();
    },
  };

  // Tab: tap to keep the inventory open, or hold it open (see hold-toggle.js).
  const menuToggle = createHoldToggle({
    threshold: 0.75,
    onOpen: () => {
      input.openMenu();
      if (!input.menuOpen) menuToggle.forceClose(); // not playing: nothing opened
    },
    onClose: () => input.closeMenu(),
  });

  function setActive(active, mode) {
    if (input.active === active && input.mode === mode) return;
    input.active = active;
    input.mode = mode;
    if (!active) {
      input.releaseAll();
      setMenu(false); // pausing closes the inventory
    }
    for (const fn of listeners) fn(active, mode);
  }

  function setMenu(open) {
    if (input.menuOpen === open) return;
    input.menuOpen = open;
    if (!open && menuToggle.open) menuToggle.forceClose(); // closed by pause / Esc / code
    for (const fn of menuListeners) fn(open);
  }

  async function acquireLock() {
    let res = await tryPointerLock({ unadjustedMovement: true });
    if (!res.ok && res.error && res.error.name === 'NotSupportedError') res = await tryPointerLock();
    return res;
  }

  /** Ask for pointer lock; resolves { ok, error } whichever way the browser reports it. */
  function tryPointerLock(options) {
    return new Promise((resolve) => {
      let done = false;
      let timer = null;
      const finish = (ok, error = null) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        document.removeEventListener('pointerlockchange', onChange);
        document.removeEventListener('pointerlockerror', onError);
        resolve({ ok, error });
      };
      const onChange = () => {
        if (document.pointerLockElement === element) finish(true);
      };
      const onError = () => setTimeout(() => finish(false), 0); // let a promise rejection report the reason first
      if (typeof element.requestPointerLock !== 'function') return finish(false);
      document.addEventListener('pointerlockchange', onChange);
      document.addEventListener('pointerlockerror', onError);
      timer = setTimeout(() => finish(document.pointerLockElement === element), 1500);
      let result;
      try {
        result = options ? element.requestPointerLock(options) : element.requestPointerLock();
      } catch (error) {
        return finish(false, error);
      }
      if (result && typeof result.then === 'function') {
        result.then(() => finish(true), (error) => finish(false, error));
      }
    });
  }

  window.addEventListener('keydown', (e) => {
    if (!input.active) return;
    // Esc pauses in free-look mode, and inside the menu (where the mouse isn't captured).
    if (e.code === 'Escape' && (input.mode === 'free' || input.menuOpen)) {
      setActive(false, null);
      return;
    }
    // Ctrl is crouch, so stop Ctrl+key browser shortcuts (save, bookmark, select all…) while playing.
    // Ctrl+W / Ctrl+T can't be blocked by any page; main.js asks before the tab closes instead.
    if (GAME_KEYS.has(e.code) || e.ctrlKey) e.preventDefault();
    if (e.repeat) return;
    keys.add(e.code);
    if (e.code === 'Space') latches.jump = true;
    if (e.code === 'KeyR') latches.reload = true;
    if (e.code === 'KeyG') latches.drop = true;
    if (e.code in SLOT_KEYS) latches.slot = SLOT_KEYS[e.code];
    if (e.code === MENU_KEY) menuToggle.press(now());
    for (const fn of keyListeners) fn(e.code);
  });
  window.addEventListener(
    'wheel',
    (e) => {
      if (!input.active || input.menuOpen || !e.deltaY) return;
      latches.slotDelta += e.deltaY > 0 ? 1 : -1;
    },
    { passive: true },
  );
  window.addEventListener('keyup', (e) => {
    keys.delete(e.code);
    // Releasing a long Tab hold closes the menu. Holding a key keeps sending (repeat) key presses,
    // so the browser still counts this as a fresh user action and lets us capture the mouse again.
    if (e.code === MENU_KEY) menuToggle.release(now());
    for (const fn of keyUpListeners) fn(e.code);
  });
  window.addEventListener('blur', () => {
    input.releaseAll();
    // Key releases won't arrive while we're unfocused: treat losing focus as letting go.
    menuToggle.release(now());
    for (const fn of keyUpListeners) fn(null);
  });

  element.addEventListener('mousedown', (e) => {
    if (input.active && !input.menuOpen) buttons.add(e.button);
  });
  window.addEventListener('mouseup', (e) => buttons.delete(e.button));
  element.addEventListener('contextmenu', (e) => e.preventDefault());

  window.addEventListener('mousemove', (e) => {
    if (!input.active || input.menuOpen) return;
    const k = input.sensitivity * (buttons.has(2) ? input.aimSensitivity : 1);
    input.yaw -= (e.movementX || 0) * k;
    input.pitch -= (e.movementY || 0) * k * (input.invertY ? -1 : 1);
    if (input.pitch > PLAYER.maxPitch) input.pitch = PLAYER.maxPitch;
    if (input.pitch < -PLAYER.maxPitch) input.pitch = -PLAYER.maxPitch;
  });

  document.addEventListener('pointerlockchange', () => {
    const locked = document.pointerLockElement === element;
    // Losing the lock pauses — unless we released it ourselves for the inventory menu.
    if (!locked && input.mode === 'locked' && !input.menuOpen) setActive(false, null);
  });

  return input;
}

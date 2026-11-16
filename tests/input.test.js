import test from 'node:test';
import assert from 'node:assert/strict';
import { createInput } from '../js/input.js';

// Minimal stand-ins for window, document and the canvas.
function fakeTarget() {
  const map = new Map();
  return {
    addEventListener(type, fn) {
      if (!map.has(type)) map.set(type, []);
      map.get(type).push(fn);
    },
    removeEventListener(type, fn) {
      const list = map.get(type);
      if (list && list.includes(fn)) list.splice(list.indexOf(fn), 1);
    },
    dispatch(type, extra = {}) {
      for (const fn of [...(map.get(type) || [])]) fn({ type, preventDefault() {}, repeat: false, ...extra });
    },
  };
}

const domError = (name) => Object.assign(new Error(name), { name });

function setup(requestPointerLock) {
  const win = fakeTarget();
  const doc = fakeTarget();
  doc.pointerLockElement = null;
  doc.exitPointerLock = () => {
    doc.pointerLockElement = null;
    doc.dispatch('pointerlockchange');
  };
  const el = fakeTarget();
  el.requestPointerLock = (opts) => requestPointerLock({ el, doc, opts });
  globalThis.window = win;
  globalThis.document = doc;
  const clock = { t: 100 };
  const input = createInput(el, { now: () => clock.t });
  const changes = [];
  input.onActiveChange((active, mode) => changes.push([active, mode]));
  return { win, doc, el, input, changes, clock };
}

// Like the Claude browser pane: every request is refused.
const refuse = (name) => ({ doc }) => {
  setTimeout(() => doc.dispatch('pointerlockerror'), 0);
  return Promise.reject(domError(name));
};

const grant = ({ el, doc }) => {
  doc.pointerLockElement = el;
  doc.dispatch('pointerlockchange');
  return Promise.resolve();
};

test('when pointer lock is refused, the game still starts in free-look mode', async () => {
  const { input, changes } = setup(refuse('WrongDocumentError'));
  const mode = await input.start();
  assert.equal(mode, 'free');
  assert.equal(input.active, true);
  assert.deepEqual(changes, [[true, 'free']]);
});

test('free-look: moving the mouse turns the view, Escape pauses', async () => {
  const { win, input, changes } = setup(refuse('WrongDocumentError'));
  await input.start();
  const yaw0 = input.yaw;
  win.dispatch('mousemove', { movementX: 100, movementY: 0 });
  assert.ok(Math.abs(input.yaw - (yaw0 - 100 * input.sensitivity)) < 1e-12);
  win.dispatch('keydown', { code: 'KeyW' });
  assert.equal(input.sample().moveZ, 1);
  win.dispatch('keydown', { code: 'Escape' });
  assert.equal(input.active, false);
  assert.deepEqual(changes.at(-1), [false, null]);
  assert.equal(input.sample().moveZ, 0, 'held keys are released on pause');
});

test('when pointer lock works, the game starts locked and pauses when the lock is lost', async () => {
  const { doc, win, input, changes } = setup(grant);
  const mode = await input.start();
  assert.equal(mode, 'locked');
  assert.equal(input.active, true);
  win.dispatch('keydown', { code: 'KeyD' });
  assert.equal(input.sample().moveX, 1);
  doc.exitPointerLock();
  assert.equal(input.active, false);
  assert.equal(input.sample().moveX, 0);
  assert.deepEqual(changes, [[true, 'locked'], [false, null]]);
});

test('if the unadjustedMovement option is unsupported, it retries without it', async () => {
  const calls = [];
  const { input } = setup((ctx) => {
    calls.push(ctx.opts);
    if (ctx.opts) return Promise.reject(domError('NotSupportedError'));
    return grant(ctx);
  });
  assert.equal(await input.start(), 'locked');
  assert.equal(calls.length, 2);
});

test('clicking play again too soon after Esc stays paused instead of falling back', async () => {
  let calls = 0;
  const { doc, input, changes } = setup((ctx) => (++calls === 1 ? grant(ctx) : refuse('SecurityError')(ctx)));
  assert.equal(await input.start(), 'locked');
  doc.exitPointerLock(); // player pressed Esc
  assert.equal(await input.start(), 'paused');
  assert.equal(input.active, false);
  assert.deepEqual(changes, [[true, 'locked'], [false, null]]);
});

test('a SecurityError on the very first request (lock not allowed at all) falls back to free-look', async () => {
  // The Claude browser pane reports "root document is not valid" as a SecurityError without options.
  const { input } = setup(refuse('SecurityError'));
  assert.equal(await input.start(), 'free');
  assert.equal(input.active, true);
});

test('Ctrl crouches only while held, 1–5 and the wheel pick slots, G drops', async () => {
  const { win, input } = setup(grant);
  await input.start();
  let prevented = false;
  win.dispatch('keydown', { code: 'ControlLeft', ctrlKey: true, preventDefault: () => (prevented = true) });
  assert.equal(input.sample().crouch, true);
  assert.equal(prevented, true, 'Ctrl shortcuts are blocked while playing');
  win.dispatch('keydown', { code: 'KeyS', ctrlKey: true });
  assert.equal(input.sample().crouch, true, 'still crouched while holding Ctrl');
  win.dispatch('keyup', { code: 'ControlLeft' });
  assert.equal(input.sample().crouch, false, 'releasing Ctrl stands up');
  win.dispatch('keyup', { code: 'KeyS' });
  win.dispatch('keydown', { code: 'ControlRight', ctrlKey: true });
  assert.equal(input.sample().crouch, true, 'right Ctrl works too');
  win.dispatch('keyup', { code: 'ControlRight' });
  win.dispatch('keydown', { code: 'KeyC' });
  assert.equal(input.sample().crouch, false, 'C no longer crouches');
  win.dispatch('keydown', { code: 'Digit3' });
  win.dispatch('wheel', { deltaY: 100 });
  win.dispatch('keydown', { code: 'KeyG' });
  const cmd = input.sample();
  assert.equal(cmd.slot, 2);
  assert.equal(cmd.slotDelta, 1);
  assert.equal(cmd.drop, true);
  input.clearLatches();
  const next = input.sample();
  assert.equal(next.slot, -1);
  assert.equal(next.slotDelta, 0);
  assert.equal(next.drop, false);
  win.dispatch('keydown', { code: 'KeyE' });
  assert.equal(input.sample().interact, true);
});

test('keys and mouse are ignored while paused', () => {
  const { win, input } = setup(grant);
  win.dispatch('keydown', { code: 'KeyW' });
  win.dispatch('mousemove', { movementX: 50, movementY: 50 });
  assert.equal(input.sample().moveZ, 0);
  assert.equal(input.yaw, 0);
});

// ---------- Inventory menu (Tab) ----------

test('opening the menu frees the mouse but keeps the game running: move yes, look and shoot no', async () => {
  const { win, el, doc, input, changes } = setup(grant);
  await input.start();
  input.openMenu();
  assert.equal(doc.pointerLockElement, null, 'the mouse is released for dragging');
  assert.equal(input.active, true, 'releasing the mouse for the menu does not pause');
  assert.equal(input.menuOpen, true);
  assert.deepEqual(changes, [[true, 'locked']]);
  win.dispatch('keydown', { code: 'KeyW' });
  assert.equal(input.sample().moveZ, 1);
  const yaw = input.yaw;
  win.dispatch('mousemove', { movementX: 80, movementY: 10 });
  assert.equal(input.yaw, yaw, 'the view does not turn while the menu is open');
  el.dispatch('mousedown', { button: 0 });
  assert.equal(input.sample().fire, false, 'clicking in the menu does not shoot');
  win.dispatch('wheel', { deltaY: 100 });
  assert.equal(input.sample().slotDelta, 0);
});

test('closing the menu captures the mouse again', async () => {
  const { win, doc, el, input } = setup(grant);
  await input.start();
  input.openMenu();
  await input.closeMenu();
  assert.equal(input.menuOpen, false);
  assert.equal(input.active, true);
  assert.equal(doc.pointerLockElement, el);
  const yaw = input.yaw;
  win.dispatch('mousemove', { movementX: 50, movementY: 0 });
  assert.notEqual(input.yaw, yaw);
});

test('if the mouse cannot be captured again after the menu, the game pauses', async () => {
  let calls = 0;
  const { input } = setup((ctx) => (++calls === 1 ? grant(ctx) : refuse('SecurityError')(ctx)));
  await input.start();
  input.openMenu();
  await input.closeMenu();
  assert.equal(input.menuOpen, false);
  assert.equal(input.active, false);
});

test('in free-look mode the menu just freezes the view', async () => {
  const { win, input } = setup(refuse('WrongDocumentError'));
  await input.start();
  input.openMenu();
  const yaw = input.yaw;
  win.dispatch('mousemove', { movementX: 80, movementY: 0 });
  assert.equal(input.yaw, yaw);
  await input.closeMenu();
  assert.equal(input.active, true);
  win.dispatch('mousemove', { movementX: 80, movementY: 0 });
  assert.notEqual(input.yaw, yaw);
});

test('Escape inside the menu closes it and pauses', async () => {
  const { win, input } = setup(grant);
  const menu = [];
  input.onMenuChange((open) => menu.push(open));
  await input.start();
  input.openMenu();
  win.dispatch('keydown', { code: 'Escape' });
  assert.equal(input.menuOpen, false);
  assert.equal(input.active, false);
  assert.deepEqual(menu, [true, false]);
});

test('queued inventory actions are sent once', async () => {
  const { input } = setup(grant);
  await input.start();
  input.queueInventoryOp({ type: 'move', from: 0, to: 2 });
  input.queueInventoryOp({ type: 'drop', slot: 1 });
  assert.deepEqual(input.sample().invOps, [{ type: 'move', from: 0, to: 2 }, { type: 'drop', slot: 1 }]);
  input.clearLatches();
  assert.equal(input.sample().invOps, null);
});

test('holding Tab for 0.75 s or more: the menu closes on release and the mouse is captured again', async () => {
  const { win, doc, el, input, clock } = setup(grant);
  await input.start();
  win.dispatch('keydown', { code: 'Tab' });
  assert.equal(input.menuOpen, true);
  assert.equal(doc.pointerLockElement, null);
  clock.t += 0.4;
  win.dispatch('keydown', { code: 'Tab', repeat: true }); // key auto-repeat while held
  assert.equal(input.menuOpen, true, 'auto-repeat keeps it open');
  clock.t += 0.6;
  win.dispatch('keyup', { code: 'Tab' });
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(input.menuOpen, false);
  assert.equal(input.active, true);
  assert.equal(doc.pointerLockElement, el);
});

test('a quick Tab tap keeps the menu open until the next Tab press', async () => {
  const { win, doc, el, input, clock } = setup(grant);
  await input.start();
  win.dispatch('keydown', { code: 'Tab' });
  clock.t += 0.2;
  win.dispatch('keyup', { code: 'Tab' });
  assert.equal(input.menuOpen, true, 'still open after a tap');
  clock.t += 3;
  win.dispatch('keydown', { code: 'Tab' });
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(input.menuOpen, false, 'the next press closes it');
  assert.equal(doc.pointerLockElement, el);
  win.dispatch('keyup', { code: 'Tab' });
  assert.equal(input.menuOpen, false, 'releasing that press does not reopen it');
});

test('losing focus during a long Tab hold closes the menu; after a tap it stays open', async () => {
  const { win, input, clock } = setup(refuse('WrongDocumentError')); // free-look: blur alone doesn't pause
  await input.start();
  win.dispatch('keydown', { code: 'Tab' });
  clock.t += 1;
  win.dispatch('blur');
  assert.equal(input.menuOpen, false);
  assert.equal(input.active, true);
  win.dispatch('keydown', { code: 'Tab' });
  clock.t += 0.1;
  win.dispatch('blur');
  assert.equal(input.menuOpen, true);
});

test('pausing with the menu open resets Tab, so the next press opens it again', async () => {
  const { win, input, clock } = setup(refuse('WrongDocumentError'));
  await input.start();
  win.dispatch('keydown', { code: 'Tab' });
  win.dispatch('keyup', { code: 'Tab' }); // tap: stays open
  win.dispatch('keydown', { code: 'Escape' }); // pause closes it
  assert.equal(input.menuOpen, false);
  await input.start();
  clock.t += 1;
  win.dispatch('keydown', { code: 'Tab' });
  assert.equal(input.menuOpen, true);
});

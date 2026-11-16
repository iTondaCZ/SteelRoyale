import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

const code = fs.readFileSync(new URL('../js/boot.js', import.meta.url), 'utf8');

// Run js/boot.js (a classic script) against a tiny fake page.
function boot(protocol) {
  const loading = { textContent: 'Loading…', className: 'loading' };
  const play = { disabled: true };
  const listeners = {};
  const window = {
    addEventListener(type, fn) {
      listeners[type] = fn;
    },
  };
  const ctx = {
    window,
    location: { protocol },
    document: { getElementById: (id) => ({ loading, play })[id] },
  };
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  return { loading, play, window, listeners };
}

test('opened as a file: explains how to start the game instead of "Loading…"', () => {
  const { loading, play } = boot('file:');
  assert.match(loading.textContent, /play\.bat/);
  assert.match(loading.textContent, /localhost:8080/);
  assert.match(loading.className, /error/);
  assert.equal(play.disabled, true);
});

test('opened as a file: a later module load error keeps the first, clearer message', () => {
  const { loading, window } = boot('file:');
  const first = loading.textContent;
  window.__steelBootFail('Could not load the game files.');
  assert.equal(loading.textContent, first);
});

test('served over http: nothing changes while loading normally', () => {
  const { loading } = boot('http:');
  assert.equal(loading.textContent, 'Loading…');
});

test('a startup error is shown on screen', () => {
  const { loading, listeners } = boot('http:');
  listeners.error({ message: 'Error creating WebGL context.' });
  assert.match(loading.textContent, /WebGL/);
  assert.match(loading.className, /error/);
});

test('the game files failing to load is shown on screen', () => {
  const { loading, window } = boot('http:');
  window.__steelBootFail('Could not load the game files (js/main.js).');
  assert.match(loading.textContent, /main\.js/);
});

test('errors after the game is ready do not replace the start screen', () => {
  const { loading, listeners, window } = boot('http:');
  window.__steelReady = true;
  listeners.error({ message: 'something later' });
  assert.equal(loading.textContent, 'Loading…');
});

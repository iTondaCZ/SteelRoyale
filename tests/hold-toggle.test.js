import test from 'node:test';
import assert from 'node:assert/strict';
import { createHoldToggle } from '../js/hold-toggle.js';

function make() {
  const log = [];
  const t = createHoldToggle({ threshold: 0.75, onOpen: () => log.push('open'), onClose: () => log.push('close') });
  return { t, log };
}

test('a quick tap opens it and it stays open after letting go', () => {
  const { t, log } = make();
  t.press(10);
  t.release(10.3);
  assert.equal(t.open, true);
  assert.deepEqual(log, ['open']);
});

test('after a tap, the next press closes it', () => {
  const { t, log } = make();
  t.press(10);
  t.release(10.2);
  t.press(15);
  assert.equal(t.open, false);
  t.release(15.1); // releasing that closing press does nothing more
  assert.equal(t.open, false);
  assert.deepEqual(log, ['open', 'close']);
});

test('holding for 0.75 s or longer closes it on release', () => {
  const { t, log } = make();
  t.press(10);
  t.release(10.75);
  assert.equal(t.open, false);
  assert.deepEqual(log, ['open', 'close']);
});

test('closing from elsewhere (e.g. pausing) resets it without a second close', () => {
  const { t, log } = make();
  t.press(10);
  t.forceClose();
  t.release(11);
  assert.equal(t.open, false);
  t.press(12);
  assert.equal(t.open, true, 'the next press opens it again');
  assert.deepEqual(log, ['open', 'open']);
});

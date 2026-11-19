import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SETTINGS, SLOT_ITEMS, normalizeSettings, applyQuality, changeSetting, slotPrefsOf, loadSettings, saveSettings,
} from '../js/settings.js';
import { SKINS } from '../js/skins.js';

const memoryStorage = (initial = {}) => {
  const data = { ...initial };
  return { getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => (data[k] = String(v)), data };
};

test('missing or broken stored settings fall back to the defaults', () => {
  assert.deepEqual(normalizeSettings(undefined), DEFAULT_SETTINGS);
  assert.deepEqual(loadSettings(memoryStorage({ 'steelroyale.settings': '{not json' })), DEFAULT_SETTINGS);
  assert.deepEqual(loadSettings(null), DEFAULT_SETTINGS, 'no storage at all (private mode)');
});

test('the default preferred slots are AR 1, shotgun 2, SMG/sniper/rocket 3, heals 4, shields 5', () => {
  const p = DEFAULT_SETTINGS.slotPrefs;
  assert.equal(DEFAULT_SETTINGS.autoSlots, true);
  assert.deepEqual(
    [p.ar, p.shotgun, p.smg, p.sniper, p.rocket, p.medkit, p.bandage, p.shieldSmall, p.shieldBig],
    [0, 1, 2, 2, 2, 3, 3, 4, 4],
  );
  assert.equal(p.pistol, -1, 'the pistol has no slot of its own');
  for (const item of SLOT_ITEMS) assert.ok(item.type in p, `${item.type} has a default`);
});

test('old saves (players and difficulty only) keep their values and gain the new defaults', () => {
  const s = normalizeSettings({ players: 25, difficulty: 'hard' });
  assert.equal(s.players, 25);
  assert.equal(s.difficulty, 'hard');
  assert.equal(s.quality, DEFAULT_SETTINGS.quality);
  assert.deepEqual(s.slotPrefs, DEFAULT_SETTINGS.slotPrefs);
});

test('out-of-range and unknown values are clamped or replaced', () => {
  const s = normalizeSettings({
    players: 7, difficulty: 'insane', fov: 300, sensitivity: -2, renderScale: 0.1, volume: 4, maxFps: 61,
    shadows: 'ultra', skin: 'nope', showFps: 'yes', slotPrefs: { ar: 9, shotgun: 2, bogus: 1 }, extra: 1,
  });
  assert.equal(s.players, DEFAULT_SETTINGS.players);
  assert.equal(s.difficulty, DEFAULT_SETTINGS.difficulty);
  assert.equal(s.fov, 100);
  assert.equal(s.sensitivity, 0.1);
  assert.equal(s.renderScale, 0.5);
  assert.equal(s.volume, 1);
  assert.equal(s.maxFps, DEFAULT_SETTINGS.maxFps);
  assert.equal(s.shadows, DEFAULT_SETTINGS.shadows);
  assert.equal(s.skin, DEFAULT_SETTINGS.skin);
  assert.equal(s.showFps, DEFAULT_SETTINGS.showFps);
  assert.equal(s.slotPrefs.ar, DEFAULT_SETTINGS.slotPrefs.ar, 'slot 10 does not exist');
  assert.equal(s.slotPrefs.shotgun, 2);
  assert.ok(!('bogus' in s.slotPrefs));
  assert.ok(!('extra' in s));
});

test('a quality preset sets its options, and changing one of them makes it Custom', () => {
  let s = applyQuality(normalizeSettings({}), 'low');
  assert.equal(s.quality, 'low');
  assert.equal(s.shadows, 'off');
  assert.ok(s.renderScale < 1);
  s = changeSetting(s, 'shadows', 'high');
  assert.equal(s.quality, 'custom');
  s = changeSetting(s, 'quality', 'high');
  assert.equal(s.shadows, 'high');
  assert.equal(s.renderScale, 1);
  s = changeSetting(s, 'fov', 90);
  assert.equal(s.quality, 'high', 'FOV is not part of the preset');
});

test('changing a setting returns a new, validated object', () => {
  const a = normalizeSettings({});
  const b = changeSetting(a, 'fov', 1000);
  assert.notEqual(a, b);
  assert.equal(a.fov, DEFAULT_SETTINGS.fov);
  assert.equal(b.fov, 100);
  const c = changeSetting(a, 'slotPrefs', { ...a.slotPrefs, pistol: 4 });
  assert.equal(c.slotPrefs.pistol, 4);
});

test('the simulation gets 0-based slots for assigned items only, or nothing when switched off', () => {
  const s = normalizeSettings({});
  const prefs = slotPrefsOf(s);
  assert.equal(prefs.ar, 0);
  assert.equal(prefs.shieldBig, 4);
  assert.ok(!('pistol' in prefs));
  assert.equal(slotPrefsOf({ ...s, autoSlots: false }), null);
});

test('settings survive a save and load', () => {
  const storage = memoryStorage();
  const s = changeSetting(changeSetting(normalizeSettings({}), 'skin', SKINS[2].id), 'volume', 0.4);
  saveSettings(storage, s);
  assert.deepEqual(loadSettings(storage), s);
});

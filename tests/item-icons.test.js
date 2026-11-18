import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WEAPONS, CONSUMABLES } from '../js/config.js';
import { ITEM_ICONS, iconKey } from '../js/ui/item-icons.js';

test('every weapon and consumable has an icon', () => {
  for (const type of Object.keys(WEAPONS)) assert.ok(ITEM_ICONS[iconKey({ kind: 'weapon', type })], `weapon ${type}`);
  for (const type of Object.keys(CONSUMABLES)) assert.ok(ITEM_ICONS[iconKey({ kind: 'consumable', type })], `consumable ${type}`);
});

test('icons are drawn from plain path data only', () => {
  for (const [key, icon] of Object.entries(ITEM_ICONS)) {
    assert.match(icon.viewBox, /^0 0 \d+ \d+$/, key);
    assert.ok(icon.shapes.length > 0, key);
    for (const s of icon.shapes) {
      assert.match(s.d, /^[MmLlHhVvQqCcZzAa0-9 .,-]+$/, `${key}: ${s.d}`);
      assert.ok(s.fill || s.stroke, `${key}: shape needs a fill or a stroke`);
    }
  }
});

test('items that look alike get different silhouettes', () => {
  // Same-category items must not share path data (the old UI only told them apart by letters).
  const seen = new Map();
  for (const [key, icon] of Object.entries(ITEM_ICONS)) {
    const sig = icon.shapes.map((s) => s.d).join('|');
    assert.ok(!seen.has(sig), `${key} looks the same as ${seen.get(sig)}`);
    seen.set(sig, key);
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { SKINS, DEFAULT_SKIN, GEAR, PALETTE_KEYS, RIG_NODES, skinById, skinParts } from '../js/skins.js';
import { RARITY } from '../js/config.js';

const HEX = /^#[0-9a-f]{6}$/i;

test('there is a varied catalogue of skins with unique ids, the default first', () => {
  assert.ok(SKINS.length >= 8);
  assert.equal(SKINS[0].id, DEFAULT_SKIN);
  assert.equal(new Set(SKINS.map((s) => s.id)).size, SKINS.length);
  assert.equal(new Set(SKINS.map((s) => s.name)).size, SKINS.length);
  assert.ok(SKINS.some((s) => s.gear.length >= 2), 'some skins change the silhouette, not just colours');
});

test('every skin has a rarity, a full colour palette and known gear', () => {
  for (const s of SKINS) {
    assert.ok(s.rarity in RARITY, `${s.id} rarity`);
    for (const k of PALETTE_KEYS) assert.match(s.palette[k], HEX, `${s.id}.${k}`);
    for (const g of s.gear) assert.ok(g in GEAR, `${s.id} gear ${g}`);
  }
});

test('every part hangs off a rig node and uses a palette colour', () => {
  for (const s of SKINS) {
    for (const part of skinParts(s)) {
      const [node, sx, sy, sz, , , , key] = part;
      assert.ok(RIG_NODES.includes(node), `${s.id}: node ${node}`);
      assert.ok(sx > 0 && sy > 0 && sz > 0, `${s.id}: size`);
      assert.ok(PALETTE_KEYS.includes(key), `${s.id}: colour ${key}`);
    }
  }
});

test('gear adds parts on top of the body', () => {
  const plain = skinParts(skinById(DEFAULT_SKIN)).length;
  const geared = SKINS.find((s) => s.gear.length);
  assert.ok(skinParts(geared).length > plain);
});

test('an unknown skin id falls back to the default skin', () => {
  assert.equal(skinById('nope').id, DEFAULT_SKIN);
  assert.equal(skinById(SKINS[3].id), SKINS[3]);
});

test('locker portraits fit their box and paint the visor over the face', async () => {
  const { portraitRects, PORTRAIT_BOX: b } = await import('../js/ui/skin-portrait.js');
  for (const s of SKINS) {
    const rects = portraitRects(s);
    for (const r of rects) {
      assert.ok(r.x >= b.x - 1e-9 && r.x + r.w <= b.x + b.w + 1e-9, `${s.id} fits horizontally`);
      assert.ok(r.y >= b.y - 1e-9 && r.y + r.h <= b.y + b.h + 1e-9, `${s.id} fits vertically`);
    }
    const face = rects.findIndex((r) => r.color === s.palette.skin && r.w === 0.34);
    const visor = rects.findLastIndex((r) => r.color === s.palette.visor);
    assert.ok(visor > face, `${s.id}: visor in front of the face`);
  }
});

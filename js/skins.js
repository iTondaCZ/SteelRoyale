// Character skins: a colour palette plus optional gear (helmets, packs, pads…).
// Plain data, no three.js: render/crowd.js builds the 3D characters from it and
// ui/skin-portrait.js draws the flat front views in the locker.

// Rig nodes a part can hang from (see render/crowd.js). The character faces −Z.
export const RIG_NODES = ['legL', 'legR', 'upper', 'head', 'armL', 'armR'];

// Where each node sits when standing still, relative to the feet (for portraits).
export const RIG_REST = {
  legL: [-0.14, 0.92, 0],
  legR: [0.14, 0.92, 0],
  upper: [0, 0.92, 0],
  head: [0, 1.58, 0],
  armL: [-0.36, 1.52, 0],
  armR: [0.36, 1.52, 0],
};

export const PALETTE_KEYS = ['torso', 'arms', 'legs', 'boots', 'skin', 'visor', 'accent', 'gear'];

// A part: [node, sizeX, sizeY, sizeZ, offsetX, offsetY, offsetZ, paletteKey]
export const BODY_PARTS = [
  ['legL', 0.22, 0.9, 0.26, 0, -0.45, 0, 'legs'],
  ['legR', 0.22, 0.9, 0.26, 0, -0.45, 0, 'legs'],
  ['legL', 0.24, 0.12, 0.32, 0, -0.86, -0.04, 'boots'],
  ['legR', 0.24, 0.12, 0.32, 0, -0.86, -0.04, 'boots'],
  ['upper', 0.58, 0.64, 0.32, 0, 0.36, 0, 'torso'],
  ['upper', 0.6, 0.1, 0.34, 0, 0.1, 0, 'accent'],
  ['head', 0.34, 0.34, 0.34, 0, 0.2, 0, 'skin'],
  ['head', 0.3, 0.1, 0.04, 0, 0.24, -0.18, 'visor'],
  ['armL', 0.15, 0.6, 0.15, 0, -0.28, 0, 'arms'],
  ['armR', 0.15, 0.6, 0.15, 0, -0.28, 0, 'arms'],
];

export const GEAR = {
  hardhat: [
    ['head', 0.38, 0.14, 0.4, 0, 0.42, 0.01, 'gear'],
    ['head', 0.46, 0.035, 0.5, 0, 0.36, -0.02, 'gear'],
  ],
  helmet: [['head', 0.4, 0.16, 0.42, 0, 0.36, 0.01, 'gear']],
  lamp: [['head', 0.1, 0.07, 0.05, 0, 0.39, -0.22, 'accent']],
  cap: [
    ['head', 0.36, 0.08, 0.36, 0, 0.4, 0, 'gear'],
    ['head', 0.3, 0.03, 0.16, 0, 0.375, -0.24, 'gear'],
  ],
  mohawk: [['head', 0.07, 0.13, 0.32, 0, 0.43, 0.02, 'accent']],
  antenna: [
    ['head', 0.03, 0.32, 0.03, 0.13, 0.5, 0.08, 'gear'],
    ['head', 0.07, 0.07, 0.07, 0.13, 0.68, 0.08, 'accent'],
  ],
  faceplate: [['head', 0.36, 0.24, 0.04, 0, 0.19, -0.195, 'visor']],
  goggles: [
    ['head', 0.36, 0.06, 0.36, 0, 0.32, 0, 'gear'],
    ['head', 0.11, 0.08, 0.04, -0.075, 0.32, -0.19, 'accent'],
    ['head', 0.11, 0.08, 0.04, 0.075, 0.32, -0.19, 'accent'],
  ],
  scarf: [
    ['upper', 0.46, 0.1, 0.38, 0, 0.66, 0, 'accent'],
    ['upper', 0.12, 0.28, 0.05, 0.1, 0.5, 0.185, 'accent'],
  ],
  stripes: [
    ['upper', 0.6, 0.05, 0.34, 0, 0.44, 0, 'accent'],
    ['upper', 0.6, 0.05, 0.34, 0, 0.56, 0, 'accent'],
  ],
  chestplate: [['upper', 0.5, 0.34, 0.06, 0, 0.45, -0.17, 'gear']],
  backpack: [
    ['upper', 0.44, 0.46, 0.2, 0, 0.38, 0.26, 'gear'],
    ['upper', 0.46, 0.1, 0.22, 0, 0.58, 0.26, 'accent'],
  ],
  pouches: [
    ['upper', 0.12, 0.12, 0.08, -0.2, 0.08, -0.2, 'gear'],
    ['upper', 0.12, 0.12, 0.08, 0.2, 0.08, -0.2, 'gear'],
  ],
  pads: [
    ['armL', 0.22, 0.14, 0.22, 0, 0, 0, 'gear'],
    ['armR', 0.22, 0.14, 0.22, 0, 0, 0, 'gear'],
  ],
  kneepads: [
    ['legL', 0.24, 0.14, 0.06, 0, -0.5, -0.15, 'gear'],
    ['legR', 0.24, 0.14, 0.06, 0, -0.5, -0.15, 'gear'],
  ],
};

const skin = (id, name, rarity, blurb, palette, gear = []) => ({ id, name, rarity, blurb, palette, gear });

export const SKINS = [
  skin('recruit', 'Recruit', 'common', 'Standard issue. Blue overalls, orange belt.', {
    torso: '#2f6fb5', arms: '#2f6fb5', legs: '#2b2f36', boots: '#1d2126',
    skin: '#d6a47a', visor: '#1b1f24', accent: '#ff7a1a', gear: '#3a4047',
  }),
  skin('foreman', 'Foreman', 'common', 'Hard hat, hi-vis vest, works the whole shift.', {
    torso: '#e8742a', arms: '#3d4a5c', legs: '#2e3b55', boots: '#4a3626',
    skin: '#c68b5f', visor: '#1b1f24', accent: '#eef0e6', gear: '#ffd23f',
  }, ['hardhat', 'stripes']),
  skin('scrapper', 'Scrapper', 'uncommon', 'Carries everything worth carrying.', {
    torso: '#6b5a3a', arms: '#57492f', legs: '#3b3428', boots: '#2a2219',
    skin: '#e0b08a', visor: '#1b1f24', accent: '#b5532a', gear: '#4a5a32',
  }, ['goggles', 'backpack', 'kneepads']),
  skin('mossback', 'Mossback', 'uncommon', 'At home in the tall grass.', {
    torso: '#4b5e2f', arms: '#4b5e2f', legs: '#3a4a2a', boots: '#2b2a20',
    skin: '#8d5a3b', visor: '#1b1f24', accent: '#a39058', gear: '#5b6b3a',
  }, ['cap', 'backpack', 'pouches']),
  skin('cobalt', 'Cobalt Guard', 'rare', 'Plated, visored, hard to put down.', {
    torso: '#1f3f8f', arms: '#18306b', legs: '#18233f', boots: '#10151f',
    skin: '#a86f4c', visor: '#6fe3ff', accent: '#38c6f4', gear: '#2a3a66',
  }, ['faceplate', 'pads', 'chestplate']),
  skin('nightshift', 'Night Shift', 'rare', 'Head lamp on, reflective stripes, no sleep.', {
    torso: '#1c2333', arms: '#1c2333', legs: '#151a24', boots: '#0f1218',
    skin: '#f0c9a4', visor: '#1b1f24', accent: '#d6ff3a', gear: '#2a2f38',
  }, ['helmet', 'lamp', 'stripes']),
  skin('ember', 'Ember', 'epic', 'Straight out of the furnace.', {
    torso: '#1a1a1e', arms: '#232328', legs: '#26262b', boots: '#121214',
    skin: '#8d5a3b', visor: '#ff7a1a', accent: '#ff4a1a', gear: '#3a1c14',
  }, ['mohawk', 'pads']),
  skin('frostbite', 'Frostbite', 'epic', 'Dressed for the cold side of the island.', {
    torso: '#e8eef4', arms: '#d5dee8', legs: '#9fb3c8', boots: '#5b6b7c',
    skin: '#f0c9a4', visor: '#9fe3ff', accent: '#5ab4ff', gear: '#c7d6e4',
  }, ['scarf', 'goggles']),
  skin('chromium', 'Chromium', 'epic', 'More machine than mechanic.', {
    torso: '#b9c2cc', arms: '#8d97a3', legs: '#6b7580', boots: '#3a4047',
    skin: '#9aa3ab', visor: '#38f4c6', accent: '#38f4c6', gear: '#dfe6ec',
  }, ['faceplate', 'antenna', 'chestplate']),
  skin('goldrivet', 'Gold Rivet', 'legendary', 'Polished brass, crested helm. Hard to miss.', {
    torso: '#c99a2e', arms: '#1e1e22', legs: '#1e1e22', boots: '#8a6a1e',
    skin: '#e0b08a', visor: '#1b1f24', accent: '#fff1b0', gear: '#f0c040',
  }, ['helmet', 'mohawk', 'pads', 'chestplate']),
];

export const DEFAULT_SKIN = SKINS[0].id;

const byId = new Map(SKINS.map((s) => [s.id, s]));
export const skinById = (id) => byId.get(id) || byId.get(DEFAULT_SKIN);

/** Every part of a skin: the body, then its gear. */
export function skinParts(s) {
  const parts = [...BODY_PARTS];
  for (const g of s.gear) parts.push(...GEAR[g]);
  return parts;
}

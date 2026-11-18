// All tunable numbers live here. Units: metres, seconds, degrees for spread.

export const SIM_HZ = 60;
export const TICK_DT = 1 / SIM_HZ;

export const PLAYER = {
  radius: 0.4,
  height: 1.8,
  eyeHeight: 1.62,
  // The shot line (and the camera) runs through a point beside the head.
  shoulderRight: 0.7,
  shoulderUp: 0.25,
  walkSpeed: 4.5,
  sprintSpeed: 6.5,
  aimSpeed: 3.0,
  backwardFactor: 0.8,
  accelGround: 45,
  accelAir: 10,
  gravity: 22,
  maxFall: 60,
  jumpSpeed: 7.5,
  stepHeight: 0.5,
  snapDown: 0.35,
  maxPitch: 1.45,
  maxHealth: 100,
  maxShield: 150,
  // Crouch & slide
  crouchHeight: 1.15,
  crouchEyeHeight: 1.0,
  crouchSpeed: 2.3,
  crouchSpreadMul: 0.6,
  slideSpeed: 8.5,
  slideDuration: 0.9,
  slideMinSpeed: 5.0,
  // Mantle: climb ledges whose top is this far above the feet. On the ground Space jumps;
  // a fresh press in mid-air (or while crouched) mantles, and in the air a ledge only has to clear mantleMinAir.
  mantleMin: 0.6,
  mantleMinAir: 0.15,
  mantleMax: 2.45,
  // Jump forgiveness
  coyoteTime: 0.1,
  jumpBuffer: 0.12,
  // Falling
  fallSafeSpeed: 14,
  fallDamagePerSpeed: 8,
  // Water and item use
  waterWadeDepth: 0.5,
  waterSpeedMul: 0.6,
  useItemSpeedMul: 0.5,
};

// Hit volumes, relative to the feet. The body capsule (segment bottom→top plus
// radius) ends at the neck (~1.40 m) so it doesn't swallow headshots.
export const HITBOX = {
  body: { bottom: 0.3, top: 1.02, radius: 0.38 },
  head: { y: 1.58, radius: 0.24 },
  crouchBody: { bottom: 0.25, top: 0.45, radius: 0.38 },
  crouchHead: { y: 0.98, radius: 0.24 },
};

export const RARITIES = [
  { id: 'common', name: 'Common', color: '#9ea3a8', dmgMul: 1.0, reloadMul: 1.0 },
  { id: 'uncommon', name: 'Uncommon', color: '#3fbf4a', dmgMul: 1.07, reloadMul: 0.95 },
  { id: 'rare', name: 'Rare', color: '#3a8dde', dmgMul: 1.14, reloadMul: 0.9 },
  { id: 'epic', name: 'Epic', color: '#a24de0', dmgMul: 1.21, reloadMul: 0.85 },
  { id: 'legendary', name: 'Legendary', color: '#f0a21a', dmgMul: 1.28, reloadMul: 0.8 },
];
export const RARITY = Object.fromEntries(RARITIES.map((r) => [r.id, r]));

const ALL_RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

// Base (Common) stats. `value` is how much bots want the weapon.
export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'Pistol', short: 'PST', ammo: 'light',
    damage: 24, fireRate: 6.5, mag: 12, reloadTime: 1.4, auto: false,
    range: 150, falloffStart: 30, falloffMin: 0.6, headMul: 1.75,
    spreadHip: 1.8, spreadAim: 0.6, spreadAir: 3, bloomPerShot: 0.6, bloomMax: 3.5, bloomRecover: 8,
    rarities: ALL_RARITIES, value: 1, bestRange: [0, 35],
  },
  smg: {
    id: 'smg', name: 'SMG', short: 'SMG', ammo: 'light',
    damage: 15, fireRate: 12, mag: 30, reloadTime: 2.0, auto: true,
    range: 120, falloffStart: 20, falloffMin: 0.55, headMul: 1.5,
    spreadHip: 2.6, spreadAim: 1.4, spreadAir: 3.5, bloomPerShot: 0.25, bloomMax: 3, bloomRecover: 9,
    rarities: ALL_RARITIES, value: 2, bestRange: [0, 25],
  },
  ar: {
    id: 'ar', name: 'Assault Rifle', short: 'AR', ammo: 'medium',
    damage: 32, fireRate: 5.5, mag: 30, reloadTime: 2.2, auto: true,
    range: 300, falloffStart: 60, falloffMin: 0.75, headMul: 1.5,
    spreadHip: 2.2, spreadAim: 0.5, spreadAir: 3, bloomPerShot: 0.45, bloomMax: 4.5, bloomRecover: 7,
    rarities: ALL_RARITIES, value: 3, bestRange: [10, 120],
  },
  shotgun: {
    id: 'shotgun', name: 'Shotgun', short: 'SG', ammo: 'shells',
    damage: 18, pellets: 9, fireRate: 1.1, mag: 5, reloadTime: 4.0, auto: false,
    range: 60, falloffStart: 15, falloffMin: 0.5, headMul: 1.5,
    spreadHip: 4.5, spreadAim: 2.8, spreadAir: 5, bloomPerShot: 0, bloomMax: 0, bloomRecover: 1,
    rarities: ALL_RARITIES, value: 3, bestRange: [0, 12],
  },
  sniper: {
    id: 'sniper', name: 'Sniper Rifle', short: 'SNP', ammo: 'heavy',
    damage: 105, fireRate: 0.4, mag: 4, reloadTime: 3.2, auto: false,
    range: 700, falloffStart: 700, falloffMin: 1, headMul: 2,
    spreadHip: 6, spreadAim: 0, spreadAir: 8, bloomPerShot: 0, bloomMax: 0, bloomRecover: 1,
    projectile: { speed: 450, gravity: 6 }, scopeFov: 22,
    rarities: ['rare', 'epic', 'legendary'], value: 3, bestRange: [60, 400],
  },
  rocket: {
    id: 'rocket', name: 'Rocket Launcher', short: 'RKT', ammo: 'rockets',
    damage: 110, fireRate: 0.6, mag: 1, reloadTime: 2.8, auto: false,
    range: 400, falloffStart: 400, falloffMin: 1, headMul: 1,
    spreadHip: 1.5, spreadAim: 0.4, spreadAir: 3, bloomPerShot: 0, bloomMax: 0, bloomRecover: 1,
    projectile: { speed: 70, gravity: 0 }, splash: { radius: 4.5, minMul: 0.4 },
    rarities: ['epic', 'legendary'], value: 4, bestRange: [12, 80],
  },
};

export const EQUIP_TIME = 0.35;

export const AMMO = {
  light: { name: 'Light Ammo', max: 300, pile: 36, color: '#d9c27a' },
  medium: { name: 'Medium Ammo', max: 300, pile: 30, color: '#6fa8dc' },
  heavy: { name: 'Heavy Ammo', max: 60, pile: 6, color: '#e06666' },
  shells: { name: 'Shells', max: 60, pile: 8, color: '#f0a050' },
  rockets: { name: 'Rockets', max: 12, pile: 2, color: '#9aa3ab' },
};

export const CONSUMABLES = {
  bandage: { name: 'Bandage', short: 'BND', health: 15, cap: 75, useTime: 3, stack: 15, pile: 5, color: '#e9e4d8' },
  medkit: { name: 'Medkit', short: 'MED', health: 100, cap: 100, useTime: 8, stack: 3, pile: 1, color: '#e34b4b' },
  shieldSmall: { name: 'Small Shield', short: 'SH-S', shield: 25, cap: 75, useTime: 2, stack: 6, pile: 3, color: '#5ab4ff' },
  shieldBig: { name: 'Big Shield', short: 'SH-L', shield: 75, cap: 150, useTime: 5, stack: 3, pile: 1, color: '#2f7fe0' },
};

export const INVENTORY = { slots: 5 };

export const LOOT = {
  chestRarity: { common: 30, uncommon: 30, rare: 22, epic: 13, legendary: 5 },
  floorRarity: { common: 46, uncommon: 32, rare: 15, epic: 6, legendary: 1 },
  weaponWeights: { pistol: 18, smg: 20, ar: 26, shotgun: 20, sniper: 10, rocket: 6 },
  consumableWeights: { bandage: 34, medkit: 12, shieldSmall: 36, shieldBig: 18 },
  ammoWeights: { light: 30, medium: 30, heavy: 12, shells: 22, rockets: 6 },
  interactRange: 2.6,
  autoPickupRange: 1.3,
};

export const BUILD = {
  grid: 4,
  storey: 4,
  wallThickness: 0.25,
  floorThickness: 0.25,
  doorWidth: 1.6,
  doorHeight: 2.6,
  windowWidth: 1.6,
  windowBottom: 1.0,
  windowTop: 2.0,
  pieceHp: 150,
};

export const MATCH = {
  // Map size (metres) by player count.
  mapSize: { 25: 720, 50: 960, 100: 1200 }, // multiples of the 3 m terrain cell
  chestsPerPlayer: 4,
  minSpawnSpacing: 45,
  playerCounts: [25, 50, 100],
};

// The storm: a safe circle that shrinks in phases. Outside it you lose health every second
// (shield doesn't help). Radii are for the 1200 m map and scale with smaller maps.
export const ZONE = {
  phases: [
    { wait: 90, shrink: 60, radius: 500, dps: 1 },
    { wait: 60, shrink: 45, radius: 300, dps: 2 },
    { wait: 60, shrink: 40, radius: 170, dps: 3 },
    { wait: 45, shrink: 35, radius: 90, dps: 5 },
    { wait: 30, shrink: 30, radius: 45, dps: 8 },
    { wait: 20, shrink: 25, radius: 15, dps: 10 },
    { wait: 15, shrink: 20, radius: 0, dps: 15 },
  ],
  baseSize: 1200,
};

export const PLACE_NAMES = [
  'Rivet Ridge', 'Foundry', 'Smelter Yard', 'Bolt Bay', 'Anvil Acres', 'Cinder Flats', 'Gearwick',
  'Ironbrook', 'Scrapton', 'Forge Heights', 'Cogwell', 'Slag Hollow', 'Tinker Point', 'Piston Park',
];

export const BOT_NAMES = [
  'Rusty', 'Sprocket', 'Cobalt', 'Wrench', 'Tinsel', 'Gasket', 'Torque', 'Ratchet', 'Flux', 'Nickel', 'Brass',
  'Pylon', 'Rivet', 'Chrome', 'Ferro', 'Ingot', 'Mantis', 'Valve', 'Sparks', 'Grit', 'Tungsten', 'Bolt', 'Zinc',
  'Copperhead', 'Static', 'Gauge', 'Lathe', 'Anvil', 'Cinder', 'Socket', 'Burr', 'Dynamo', 'Kettle', 'Ember',
  'Quill', 'Hex', 'Solder', 'Crank', 'Moss', 'Pike', 'Onyx', 'Drift', 'Vapor', 'Shale', 'Ridge', 'Clank', 'Tusk',
];

export const BOT_DIFFICULTY = {
  // reaction: seconds before the first shot; aimError: radians of aim wobble; turnRate: rad/s
  // aimError: metres of aim wobble at the target (grows with distance and movement)
  easy: { reaction: [0.7, 1.1], aimError: 1.6, turnRate: 3.2, burst: [0.25, 0.5], pause: [0.45, 0.85], strafe: 0.35, crouch: 0, headChance: 0, viewRange: 75, accuracyGain: 0.25 },
  normal: { reaction: [0.4, 0.65], aimError: 1.15, turnRate: 4.8, burst: [0.35, 0.8], pause: [0.25, 0.5], strafe: 0.7, crouch: 0.15, headChance: 0.1, viewRange: 95, accuracyGain: 0.45 },
  hard: { reaction: [0.22, 0.38], aimError: 0.75, turnRate: 7, burst: [0.5, 1.0], pause: [0.15, 0.3], strafe: 0.9, crouch: 0.3, headChance: 0.25, viewRange: 120, accuracyGain: 0.6 },
};

export const DUMMY = {
  respawnTime: 3,
  shields: [0, 50, 100, 150],
};

export const CAMERA = {
  distance: 3.6,
  aimDistance: 1.9,
  fov: 75,
  aimFov: 50,
  minDistance: 0.35,
  probeRadius: 0.3,
};

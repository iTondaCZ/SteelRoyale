// Player settings: defaults, validation, quality presets, and saving to localStorage.
// Plain data and functions (no DOM), so tests can check them; ui/menu.js draws the screens.
import { MATCH, CAMERA, INVENTORY } from './config.js';
import { SKINS, DEFAULT_SKIN } from './skins.js';

export const STORAGE_KEY = 'steelroyale.settings';

// Items that can have a slot of their own, in the order the settings screen lists them.
export const SLOT_ITEMS = [
  { kind: 'weapon', type: 'ar' },
  { kind: 'weapon', type: 'shotgun' },
  { kind: 'weapon', type: 'smg' },
  { kind: 'weapon', type: 'sniper' },
  { kind: 'weapon', type: 'rocket' },
  { kind: 'weapon', type: 'pistol' },
  { kind: 'consumable', type: 'medkit' },
  { kind: 'consumable', type: 'bandage' },
  { kind: 'consumable', type: 'shieldSmall' },
  { kind: 'consumable', type: 'shieldBig' },
];

// 0-based slot per item type; -1 = no slot of its own.
const DEFAULT_SLOT_PREFS = {
  ar: 0, shotgun: 1, smg: 2, sniper: 2, rocket: 2, pistol: -1, medkit: 3, bandage: 3, shieldSmall: 4, shieldBig: 4,
};

// What each graphics preset sets. Changing one of these by hand makes the preset "custom".
export const QUALITY_PRESETS = {
  low: { shadows: 'off', renderScale: 0.75 },
  medium: { shadows: 'low', renderScale: 1 },
  high: { shadows: 'high', renderScale: 1 },
};
const PRESET_KEYS = Object.keys(QUALITY_PRESETS.high);

export const FPS_LIMITS = [0, 30, 60, 120, 144]; // 0 = no cap (the screen's refresh rate)

const choice = (values, def) => ({ kind: 'choice', values, def });
const range = (min, max, step, def) => ({ kind: 'range', min, max, step, def });
const flag = (def) => ({ kind: 'flag', def });

export const SCHEMA = {
  players: choice(MATCH.playerCounts, 100),
  difficulty: choice(['easy', 'normal', 'hard'], 'normal'),
  skin: choice(SKINS.map((s) => s.id), DEFAULT_SKIN),
  quality: choice(['low', 'medium', 'high', 'custom'], 'high'),
  shadows: choice(['off', 'low', 'high'], 'high'),
  renderScale: range(0.5, 1, 0.05, 1),
  maxFps: choice(FPS_LIMITS, 0),
  fov: range(60, 100, 1, CAMERA.fov),
  showFps: flag(true),
  sensitivity: range(0.1, 3, 0.05, 1),
  aimSensitivity: range(0.2, 1.5, 0.05, 1),
  invertY: flag(false),
  volume: range(0, 1, 0.05, 1),
  autoSlots: flag(true),
};

function clean(spec, v) {
  if (spec.kind === 'choice') return spec.values.includes(v) ? v : spec.def;
  if (spec.kind === 'flag') return typeof v === 'boolean' ? v : spec.def;
  const n = Number(v);
  if (v === null || v === '' || typeof v === 'boolean' || !Number.isFinite(n)) return spec.def;
  const stepped = Math.round(Math.min(spec.max, Math.max(spec.min, n)) / spec.step) * spec.step;
  return Number(stepped.toFixed(4));
}

function cleanSlotPrefs(raw) {
  const out = {};
  for (const { type } of SLOT_ITEMS) {
    const v = raw && typeof raw === 'object' ? raw[type] : undefined;
    out[type] = Number.isInteger(v) && v >= -1 && v < INVENTORY.slots ? v : DEFAULT_SLOT_PREFS[type];
  }
  return out;
}

/** A complete, valid settings object from anything (a parsed save, partial changes, garbage). */
export function normalizeSettings(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const out = {};
  for (const [key, spec] of Object.entries(SCHEMA)) out[key] = clean(spec, src[key]);
  out.slotPrefs = cleanSlotPrefs(src.slotPrefs);
  return out;
}

export const DEFAULT_SETTINGS = Object.freeze({ ...normalizeSettings({}), slotPrefs: Object.freeze(cleanSlotPrefs()) });

/** Apply a graphics preset. */
export function applyQuality(s, quality) {
  return normalizeSettings({ ...s, quality, ...(QUALITY_PRESETS[quality] || {}) });
}

/** A copy of `s` with one setting changed (validated, and the preset name kept in step). */
export function changeSetting(s, key, value) {
  if (key === 'quality') return applyQuality(s, value);
  const next = normalizeSettings({ ...s, [key]: value });
  if (PRESET_KEYS.includes(key)) {
    const match = Object.entries(QUALITY_PRESETS).find(([, p]) => PRESET_KEYS.every((k) => p[k] === next[k]));
    next.quality = match ? match[0] : 'custom';
  }
  return next;
}

/** The simulation's view of the slot setting: { type: slotIndex } for assigned items, or null when off. */
export function slotPrefsOf(s) {
  if (!s.autoSlots) return null;
  const out = {};
  for (const [type, slot] of Object.entries(s.slotPrefs)) if (slot >= 0) out[type] = slot;
  return out;
}

export function loadSettings(storage) {
  try {
    return normalizeSettings(JSON.parse(storage.getItem(STORAGE_KEY) || '{}'));
  } catch {
    return normalizeSettings({}); // no storage (private mode) or a broken save
  }
}

export function saveSettings(storage, s) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* private mode: fine, just not remembered */
  }
}

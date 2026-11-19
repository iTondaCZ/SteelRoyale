// The main menu and pause screen: Play, Locker (skins) and Settings.
// It edits a settings object (js/settings.js) and reports every change through onChange;
// main.js applies and saves them. All text goes in with textContent.
import { RARITY, WEAPONS, CONSUMABLES, INVENTORY } from '../config.js';
import { SKINS, skinById } from '../skins.js';
import { SCHEMA, SLOT_ITEMS, DEFAULT_SETTINGS, FPS_LIMITS, changeSetting, normalizeSettings } from '../settings.js';
import { createItemIcon } from './item-icons.js';
import { createSkinPortrait } from './skin-portrait.js';

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};
const pct = (v) => `${Math.round(v * 100)}%`;

const KEYS = [
  [['W', 'A', 'S', 'D'], 'Move'],
  [['Shift'], 'Sprint'],
  [['Space'], 'Jump, again in mid-air to mantle'],
  [['Ctrl'], 'Hold to crouch, slide when sprinting'],
  [['LMB'], 'Shoot or use the item'],
  [['RMB'], 'Aim'],
  [['E'], 'Pick up, open'],
  [['1', '5'], 'Slots (or the mouse wheel)'],
  [['Tab'], 'Inventory, tap or hold'],
  [['R'], 'Reload'],
  [['G'], 'Drop the item'],
  [['M'], 'Map, tap or hold'],
  [['Esc'], 'Pause'],
];

const itemName = ({ kind, type }) => (kind === 'weapon' ? WEAPONS[type].name : CONSUMABLES[type].name);

/**
 * root: the #overlay element. settings: the current settings. onChange(next): a setting changed.
 * onPlay(), onTraining(), onResume(), onMainMenu(): the big buttons.
 */
export function createMenu({ root, settings, onChange, onPlay, onTraining, onResume, onMainMenu }) {
  const $ = (s) => root.querySelector(s);
  let s = settings;
  let context = 'lobby'; // 'lobby' (main menu) | 'game' (paused or about to drop in)
  let view = 'play'; // 'play' | 'locker' | 'pause'
  let settingsOpen = false; // the settings window sits on top of any view
  let section = 'video';
  const syncs = []; // re-read the settings into every control

  const commit = (next) => {
    s = next;
    onChange(s);
    refresh();
  };
  const set = (key, value) => commit(changeSetting(s, key, value));

  // ---------- Controls ----------

  /** Segmented buttons. options: [[value, label, { disabled }?]] */
  function seg(key, options, { get = () => s[key], put = (v) => set(key, v), label } = {}) {
    const box = el('div', 'seg');
    box.setAttribute('role', 'radiogroup');
    if (label) box.setAttribute('aria-label', label);
    const buttons = options.map(([value, text, opts = {}]) => {
      const b = el('button', null, text);
      b.type = 'button';
      b.setAttribute('role', 'radio');
      if (opts.disabled) b.disabled = true;
      b.addEventListener('click', () => put(value));
      box.append(b);
      return { b, value };
    });
    syncs.push(() => {
      for (const { b, value } of buttons) {
        const on = get() === value;
        b.classList.toggle('active', on);
        b.setAttribute('aria-checked', String(on));
      }
    });
    return box;
  }

  function range(key, format, label) {
    const spec = SCHEMA[key];
    const wrap = el('div', 'range');
    const input = el('input');
    input.type = 'range';
    input.min = String(spec.min);
    input.max = String(spec.max);
    input.step = String(spec.step);
    input.setAttribute('aria-label', label);
    const out = el('output');
    input.addEventListener('input', () => set(key, Number(input.value)));
    wrap.append(input, out);
    syncs.push(() => {
      input.value = String(s[key]);
      out.textContent = format(s[key]);
      const k = (s[key] - spec.min) / (spec.max - spec.min);
      input.style.setProperty('--fill', `${k * 100}%`);
    });
    return wrap;
  }

  function toggle(key, label) {
    const b = el('button', 'switch');
    b.type = 'button';
    b.setAttribute('role', 'switch');
    b.setAttribute('aria-label', label);
    const text = el('span', 'switch-text');
    b.append(el('span', 'knob'), text);
    b.addEventListener('click', () => set(key, !s[key]));
    syncs.push(() => {
      b.setAttribute('aria-checked', String(s[key]));
      text.textContent = s[key] ? 'On' : 'Off';
    });
    return b;
  }

  function row(label, hint, control) {
    const r = el('div', 'set-row');
    const text = el('div', 'set-text');
    text.append(el('div', 'set-label', label));
    if (hint) text.append(el('div', 'set-hint', hint));
    r.append(text, control);
    return r;
  }

  // ---------- Settings sections ----------

  const SECTIONS = [
    {
      id: 'video',
      title: 'Video',
      keys: ['quality', 'shadows', 'renderScale', 'maxFps', 'fov', 'showFps'],
      build: (body) => {
        body.append(
          row('Graphics quality', 'Sets shadows and render scale together.', seg('quality', [
            ['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['custom', 'Custom', { disabled: true }],
          ], { label: 'Graphics quality' })),
          row('Shadows', 'Turning them off is the biggest speed-up on laptops.', seg('shadows', [
            ['off', 'Off'], ['low', 'Low'], ['high', 'High'],
          ], { label: 'Shadows' })),
          row('Render scale', 'Draws fewer pixels and stretches the picture to fit. Lower is faster but blurrier.', range('renderScale', pct, 'Render scale')),
          row('Frame rate limit', 'Caps frames per second to keep a laptop cooler.', seg('maxFps', FPS_LIMITS.map((v) => [v, v ? String(v) : 'None']), { label: 'Frame rate limit' })),
          row('Field of view', 'How wide the camera sees. Aiming zooms in from here.', range('fov', (v) => `${v}°`, 'Field of view')),
          row('Show FPS counter', 'Frames per second in the top right corner.', toggle('showFps', 'Show FPS counter')),
        );
      },
    },
    {
      id: 'controls',
      title: 'Controls',
      keys: ['sensitivity', 'aimSensitivity', 'invertY'],
      build: (body) => {
        body.append(
          row('Mouse sensitivity', null, range('sensitivity', (v) => `${v.toFixed(2)}×`, 'Mouse sensitivity')),
          row('Aiming sensitivity', 'Turn speed while holding right mouse, compared with normal.', range('aimSensitivity', pct, 'Aiming sensitivity')),
          row('Invert mouse Y', 'Moving the mouse down looks up.', toggle('invertY', 'Invert mouse Y')),
        );
        const list = el('ul', 'keys');
        for (const [keys, what] of KEYS) {
          const li = el('li');
          const k = el('span', 'key-caps');
          keys.forEach((key, i) => {
            if (i && keys.length === 2 && key === '5') k.append('–');
            k.append(el('kbd', null, key));
          });
          li.append(k, el('span', null, what));
          list.append(li);
        }
        const keysBlock = el('div', 'keys-block');
        keysBlock.append(el('h3', null, 'Keys'), list);
        body.append(keysBlock);
      },
    },
    {
      id: 'audio',
      title: 'Audio',
      keys: ['volume'],
      build: (body) => body.append(row('Volume', 'Gunfire, hits, pickups and everything else.', range('volume', pct, 'Volume'))),
    },
    {
      id: 'slots',
      title: 'Item slots',
      keys: ['autoSlots', 'slotPrefs'],
      build: buildSlots,
    },
  ];

  function buildSlots(body) {
    body.append(
      row(
        'Put pickups in their own slot',
        'An item you pick up goes to its slot below if that slot is empty. Otherwise it takes a free slot as usual.',
        toggle('autoSlots', 'Put pickups in their own slot'),
      ),
    );

    // The hotbar as it will fill up.
    const bar = el('div', 'slot-preview');
    const cells = [];
    for (let i = 0; i < INVENTORY.slots; i++) {
      const cell = el('div', 'slot-cell');
      const icons = el('div', 'slot-icons');
      cell.append(el('span', 'key', String(i + 1)), icons);
      bar.append(cell);
      cells.push(icons);
    }
    body.append(bar);
    syncs.push(() => {
      bar.classList.toggle('off', !s.autoSlots);
      cells.forEach((icons, i) => {
        icons.replaceChildren();
        const items = SLOT_ITEMS.filter((it) => s.slotPrefs[it.type] === i);
        for (const it of items) {
          const icon = createItemIcon(it);
          if (!icon) continue;
          if (it.kind === 'consumable') icon.style.color = CONSUMABLES[it.type].color;
          icon.setAttribute('aria-hidden', 'true');
          icons.append(icon);
        }
        if (!items.length) icons.append(el('span', 'free', 'Free'));
      });
    });

    const table = el('div', 'slot-table');
    for (const it of SLOT_ITEMS) {
      const r = el('div', 'slot-row');
      const icon = el('span', `slot-item-icon ${it.kind}`);
      const svg = createItemIcon(it);
      if (svg) icon.append(svg);
      if (it.kind === 'consumable') icon.style.color = CONSUMABLES[it.type].color;
      const options = [[-1, 'Any']];
      for (let i = 0; i < INVENTORY.slots; i++) options.push([i, String(i + 1)]);
      r.append(
        icon,
        el('span', 'slot-item-name', itemName(it)),
        seg(null, options, {
          label: `${itemName(it)} slot`,
          get: () => s.slotPrefs[it.type],
          put: (v) => set('slotPrefs', { ...s.slotPrefs, [it.type]: v }),
        }),
      );
      table.append(r);
    }
    body.append(table);
    syncs.push(() => table.classList.toggle('off', !s.autoSlots));
  }

  const tabs = $('#settings-tabs');
  const body = $('#settings-body');
  const panes = new Map();
  for (const sec of SECTIONS) {
    const t = el('button', null, sec.title);
    t.type = 'button';
    t.dataset.section = sec.id;
    t.addEventListener('click', () => showSection(sec.id));
    tabs.append(t);
    const pane = el('div', 'settings-pane');
    pane.dataset.section = sec.id;
    sec.build(pane);
    body.append(pane);
    panes.set(sec.id, pane);
  }

  function showSection(id) {
    section = id;
    for (const t of tabs.children) t.classList.toggle('active', t.dataset.section === id);
    for (const [pid, pane] of panes) pane.hidden = pid !== id;
    body.scrollTop = 0;
  }

  $('#settings-reset').addEventListener('click', () => {
    const sec = SECTIONS.find((x) => x.id === section);
    const next = { ...s };
    for (const k of sec.keys) next[k] = DEFAULT_SETTINGS[k];
    commit(normalizeSettings(next));
  });
  $('#settings-done').addEventListener('click', () => openSettings(false));
  $('#settings-close').addEventListener('click', () => openSettings(false));
  $('#open-settings').addEventListener('click', () => openSettings(true));

  // ---------- Play view ----------

  for (const box of root.querySelectorAll('.match-card .seg')) {
    const key = box.dataset.name;
    const buttons = [...box.querySelectorAll('button')];
    for (const b of buttons) b.addEventListener('click', () => set(key, key === 'players' ? Number(b.dataset.value) : b.dataset.value));
    syncs.push(() => buttons.forEach((b) => b.classList.toggle('active', String(s[key]) === b.dataset.value)));
  }
  $('#play').addEventListener('click', () => onPlay());
  $('#training').addEventListener('click', () => onTraining());
  $('#resume').addEventListener('click', () => onResume());
  $('#pause-settings').addEventListener('click', () => openSettings(true));
  $('#pause-menu').addEventListener('click', () => onMainMenu());

  // ---------- Locker ----------

  const grid = $('#skin-grid');
  const cards = SKINS.map((skin) => {
    const card = el('button', 'skin-card');
    card.type = 'button';
    card.setAttribute('role', 'radio');
    card.style.setProperty('--rarity', RARITY[skin.rarity].color);
    const art = el('span', 'art');
    art.append(createSkinPortrait(skin));
    const label = el('span', 'label');
    label.append(el('span', 'name', skin.name), el('span', 'rarity', RARITY[skin.rarity].name));
    card.append(el('span', 'equipped', 'Equipped'), art, label);
    card.addEventListener('click', () => set('skin', skin.id));
    grid.append(card);
    return { card, skin };
  });
  syncs.push(() => {
    for (const { card, skin } of cards) {
      const on = skin.id === s.skin;
      card.classList.toggle('selected', on);
      card.setAttribute('aria-checked', String(on));
    }
    const skin = skinById(s.skin);
    $('#plate-name').textContent = skin.name;
    $('#plate-blurb').textContent = skin.blurb;
    const rarity = $('#plate-rarity');
    rarity.textContent = RARITY[skin.rarity].name;
    rarity.style.color = RARITY[skin.rarity].color;
    const worn = $('#locker-skin');
    worn.textContent = skin.name;
    worn.style.color = RARITY[skin.rarity].color;
  });
  $('#open-locker').addEventListener('click', () => show('locker'));
  $('#locker-back').addEventListener('click', () => show('play'));

  // ---------- Views ----------

  function show(v) {
    view = v;
    for (const sec of root.querySelectorAll('.menu-view')) sec.hidden = sec.dataset.view !== v;
    root.dataset.view = v;
  }

  const modal = $('#settings-modal');
  let opener = null;
  function openSettings(open) {
    if (open === settingsOpen) return;
    settingsOpen = open;
    modal.hidden = !open;
    root.classList.toggle('settings-open', open);
    if (open) {
      opener = document.activeElement;
      showSection(section);
      tabs.querySelector('.active')?.focus();
    } else if (opener && opener.isConnected) {
      opener.focus();
    }
  }
  modal.addEventListener('click', (e) => {
    if (e.target === modal) openSettings(false); // click outside the window
  });

  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Escape' || root.classList.contains('hidden')) return;
    if (settingsOpen) openSettings(false);
    else if (view === 'locker') show('play');
  });

  function refresh() {
    for (const fn of syncs) fn();
  }

  refresh();
  show('play');

  return {
    get view() {
      return view;
    },
    get settingsOpen() {
      return settingsOpen;
    },
    openSettings,
    get settings() {
      return s;
    },
    /** 'lobby': main menu over the stage · 'game': pause / drop-in screen over the match. */
    setContext(ctx, { title, sub, action } = {}) {
      context = ctx;
      openSettings(false);
      root.classList.toggle('in-lobby', ctx === 'lobby');
      root.classList.toggle('in-game', ctx === 'game');
      if (title != null) $('#pause-title').textContent = title;
      if (sub != null) $('#overlay-sub').textContent = sub;
      if (action != null) $('#resume').textContent = action;
      show(ctx === 'lobby' ? 'play' : 'pause');
    },
    setSub(text) {
      $('#overlay-sub').textContent = text;
    },
    show,
    /** Disable the start buttons while a match is being built. */
    setBusy(busy, status = '') {
      $('#play').disabled = busy;
      $('#training').disabled = busy;
      $('#resume').disabled = busy;
      $('#loading').textContent = status;
      if (busy && context === 'game') $('#overlay-sub').textContent = status;
    },
  };
}

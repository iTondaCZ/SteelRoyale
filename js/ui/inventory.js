// The inventory lives in the hotbar at the bottom right.
// Normally it's a compact row of 5 slots. With Tab it grows in place into a row of large
// cards that you can rearrange: drag an item onto another slot to move/swap it (same
// consumables merge), drag it off the inventory to drop it, click to equip.
// Ammo can be dragged off too. You keep moving the whole time.
// The UI never changes the game directly: it queues inventory actions (onOp) for the simulation.
import { WEAPONS, RARITY, CONSUMABLES, AMMO, RARITIES } from '../config.js';

const DRAG_THRESHOLD = 5;

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

export function createInventoryUI({ loadout, hotbar, reserves, hud, onOp }) {
  // Header (only shown while expanded)
  const head = el('div', 'inv-head');
  head.append(el('div', 'inv-title', 'Inventory'), el('div', 'inv-hint', 'Drag to move · drag off to drop · click to equip'));
  loadout.prepend(head);

  const cards = [];
  for (let i = 0; i < 5; i++) {
    const card = el('div', 'slot');
    card.dataset.slot = String(i);
    const icon = el('span', 'icon');
    const count = el('span', 'count');
    const info = el('div', 'info');
    const title = el('div', 'title');
    const meta = el('div', 'meta');
    info.append(title, meta);
    card.append(el('span', 'key', String(i + 1)), icon, count, info);
    hotbar.append(card);
    cards.push({ card, icon, count, title, meta });
  }
  const chips = {};
  for (const type of Object.keys(AMMO)) {
    const chip = el('div', 'chip');
    chip.dataset.ammo = type;
    chip.style.setProperty('--c', AMMO[type].color);
    const count = el('b');
    chip.append(el('span', 'label', AMMO[type].name.replace(' Ammo', '')), count);
    reserves.append(chip);
    chips[type] = { chip, count };
  }

  let open = false;
  let lastKey = '';
  let player = null;

  // ---------- Drag & drop (pointer events, so it also works without pointer lock) ----------
  let drag = null;

  function startGhost(source) {
    const ghost = source.cloneNode(true);
    ghost.classList.add('inv-ghost');
    ghost.classList.remove('selected', 'drop-target', 'dragging');
    const r = source.getBoundingClientRect();
    ghost.style.width = `${r.width}px`;
    ghost.style.height = `${r.height}px`;
    document.body.append(ghost);
    source.classList.add('dragging');
    return ghost;
  }

  function targetAt(x, y) {
    const hit = document.elementFromPoint(x, y);
    const slot = hit && hit.closest('#hotbar .slot');
    return { slot: slot ? Number(slot.dataset.slot) : -1, inside: !!(hit && hit.closest('#loadout')) };
  }

  function clearTargets() {
    for (const c of cards) c.card.classList.remove('drop-target');
    hud.classList.remove('inv-dropping');
  }

  function cancelDrag() {
    if (!drag) return;
    if (drag.ghost) drag.ghost.remove();
    drag.source.classList.remove('dragging');
    drag = null;
    clearTargets();
  }

  loadout.addEventListener('pointerdown', (e) => {
    if (!open || e.button !== 0 || !player) return;
    const card = e.target.closest('.slot');
    const chip = e.target.closest('.chip');
    if (card && player.inventory.slots[Number(card.dataset.slot)]) drag = { kind: 'slot', from: Number(card.dataset.slot), source: card };
    else if (chip && player.ammo[chip.dataset.ammo] > 0) drag = { kind: 'ammo', ammoType: chip.dataset.ammo, source: chip };
    else if (card) drag = { kind: 'select', from: Number(card.dataset.slot), source: card };
    else return;
    e.preventDefault();
    Object.assign(drag, { x0: e.clientX, y0: e.clientY, moved: false, pointerId: e.pointerId });
    try {
      loadout.setPointerCapture(e.pointerId); // keep getting moves while dragging outside the column
    } catch {
      /* not a live pointer (e.g. synthetic events): moves still arrive while over the column */
    }
  });

  loadout.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.pointerId || drag.kind === 'select') return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < DRAG_THRESHOLD) return;
    if (!drag.moved) {
      drag.moved = true;
      drag.ghost = startGhost(drag.source);
    }
    drag.ghost.style.left = `${e.clientX}px`;
    drag.ghost.style.top = `${e.clientY}px`;
    clearTargets();
    const t = targetAt(e.clientX, e.clientY);
    if (!t.inside) hud.classList.add('inv-dropping');
    else if (drag.kind === 'slot' && t.slot >= 0 && t.slot !== drag.from) cards[t.slot].card.classList.add('drop-target');
  });

  function endDrag(e, cancelled) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const d = drag;
    cancelDrag();
    if (cancelled) return;
    if (!d.moved) {
      if (d.kind !== 'ammo') onOp({ type: 'select', slot: d.from });
      return;
    }
    const t = targetAt(e.clientX, e.clientY);
    if (!t.inside) onOp(d.kind === 'ammo' ? { type: 'dropAmmo', ammoType: d.ammoType } : { type: 'drop', slot: d.from });
    else if (d.kind === 'slot' && t.slot >= 0 && t.slot !== d.from) onOp({ type: 'move', from: d.from, to: t.slot });
  }
  loadout.addEventListener('pointerup', (e) => endDrag(e, false));
  loadout.addEventListener('pointercancel', (e) => endDrag(e, true));

  function describe(item, p) {
    if (!item) return { icon: '', count: '', title: 'Empty', meta: '', color: '' };
    if (item.kind === 'weapon') {
      const def = WEAPONS[item.type];
      const r = RARITY[item.rarity];
      return {
        icon: def.short,
        count: '',
        title: `${r.name} ${def.name}`,
        meta: `${item.mag}/${def.mag} · ${p.ammo[def.ammo]} ${AMMO[def.ammo].name.replace(' Ammo', '').toLowerCase()}`,
        color: r.color,
        tier: RARITIES.findIndex((x) => x.id === item.rarity),
      };
    }
    const def = CONSUMABLES[item.type];
    const effect = def.health ? `+${def.health === 100 ? 'full' : def.health} health` : `+${def.shield} shield`;
    return { icon: def.short, count: `×${item.count}`, title: `${def.name} ×${item.count}`, meta: `${effect} · ${def.useTime}s to use`, color: def.color };
  }

  return {
    /** Grow into the editable inventory (true) or back to the hotbar (false). */
    setOpen(value) {
      open = value;
      hud.classList.toggle('inv-open', open);
      if (!open) cancelDrag();
    },
    /** Refresh from the player's state (only touches the DOM when something changed). */
    update(p) {
      player = p;
      const inv = p.inventory;
      const key = `${inv.selected}|${inv.slots.map((s) => (s ? `${s.type}:${s.rarity || s.count}:${s.mag ?? ''}` : '-')).join(',')}|${Object.values(p.ammo).join(',')}`;
      if (key === lastKey) return;
      lastKey = key;
      inv.slots.forEach((item, i) => {
        const d = describe(item, p);
        const c = cards[i];
        c.icon.textContent = d.icon;
        c.count.textContent = d.count;
        c.title.textContent = d.title;
        c.meta.textContent = d.meta;
        if (d.color) c.card.style.setProperty('--slot-color', d.color);
        else c.card.style.removeProperty('--slot-color');
        c.card.classList.toggle('empty', !item);
        c.card.classList.toggle('selected', inv.selected === i);
        c.card.dataset.tier = d.tier ?? '';
      });
      for (const [type, { chip, count }] of Object.entries(chips)) {
        count.textContent = String(p.ammo[type]);
        chip.classList.toggle('none', p.ammo[type] <= 0);
      }
    },
  };
}

// Item icons for the hotbar/inventory, drawn as inline SVG.
// Weapons are side views (muzzle to the right) on a 64×24 box, drawn to scale against each
// other, so a pistol reads small and a sniper long. They use currentColor, which the CSS
// keeps near-white while the slot behind them carries the rarity colour.
// Consumables are upright objects on a 24×24 box; currentColor is their own colour from config.
// The data is plain (no DOM at import) so a test can check that every item has an icon.

const DETAIL = 'rgba(0,0,0,.42)'; // cut-in details (ports, grooves) that read on any colour
const BODY = 'currentColor';
const GLASS = 'rgba(255,255,255,.5)';
const EMBLEM = 'rgba(255,255,255,.88)';
const CAP = '#c9d1d8';

const fill = (d, f = BODY) => ({ d, fill: f });
const line = (d, w, s = BODY) => ({ d, stroke: s, w });
const circle = (cx, cy, r) => `M${cx - r} ${cy} a${r} ${r} 0 1 0 ${2 * r} 0 a${r} ${r} 0 1 0 ${-2 * r} 0 Z`;

const WEAPON_BOX = '0 0 64 24';
const ITEM_BOX = '0 0 24 24';

export const ITEM_ICONS = {
  'weapon:pistol': {
    viewBox: WEAPON_BOX,
    shapes: [
      fill('M19 5.5 H46 V10.5 H18 V6.5 Z'), // slide
      fill('M20 10 H44 V12.5 H20 Z'), // frame
      fill('M20 12 H28 L25.8 21.5 H17.6 Z'), // grip
      line('M28 12 V15.6 Q28 17 29.4 17 H31.6 Q33 17 33 15.6 V12', 1.4), // trigger guard
      line('M21 6.8 V9.2 M22.6 6.8 V9.2 M24.2 6.8 V9.2', 0.8, DETAIL), // serrations
      fill('M34 7 H38.5 V8.6 H34 Z', DETAIL), // ejection port
    ],
  },
  'weapon:smg': {
    viewBox: WEAPON_BOX,
    shapes: [
      fill('M9.5 6 H12 V14.5 H9.5 Z'), // butt plate
      line('M11 7.2 H18 M11 12.8 L18 11.4', 1.5), // wire stock
      fill('M18 6 H46 V12 H18 Z'), // receiver
      fill('M46 8 H53 V10 H46 Z'), // barrel
      fill('M52.5 7.4 H55 V10.6 H52.5 Z'), // muzzle
      fill('M21 4.4 H25 V6 H21 Z'), // rear sight
      fill('M43.5 4.6 H45 V6 H43.5 Z'), // front sight
      fill('M21.5 12 H27.5 L25.8 20.5 H19.8 Z'), // grip
      fill('M33 12 H37.4 V22.5 H33 Z'), // long straight magazine
      line('M27.5 12 V14.4 Q27.5 15.6 28.7 15.6 H33', 1.3), // trigger guard
      fill('M37.5 7.6 H42.5 V9.2 H37.5 Z', DETAIL), // ejection port
    ],
  },
  'weapon:ar': {
    viewBox: WEAPON_BOX,
    shapes: [
      fill('M2 7.4 H6 L16 8 V12.6 L6 15.8 H2 Z'), // stock
      fill('M16 6.5 H34 V13 H16 Z'), // receiver
      fill('M34 7 H50 V12 H34 Z'), // handguard
      fill('M50 8.6 H59 V10.4 H50 Z'), // barrel
      fill('M58.5 7.8 H62 V11.2 H58.5 Z'), // muzzle
      fill('M46.5 3.8 H48 V7 H46.5 Z'), // front sight
      fill('M19 3.8 H30 V6.5 H28.4 V5.3 H20.6 V6.5 H19 Z'), // carry handle
      fill('M18.5 13 H23.5 L22 20.5 H17 Z'), // grip
      fill('M26.5 13 H31.5 Q32 17.6 34.6 21.2 L30.2 22.8 Q27.6 18.6 26.5 13 Z'), // curved magazine
      fill('M37 8.8 H39 V10.2 H37 Z M41 8.8 H43 V10.2 H41 Z M45 8.8 H47 V10.2 H45 Z', DETAIL), // vents
    ],
  },
  'weapon:shotgun': {
    viewBox: WEAPON_BOX,
    shapes: [
      fill('M2 9.6 L18 7.8 V12.6 L4.4 17.4 Q2 18 2 16 Z'), // stock
      fill('M18 7 H31 V13 H18 Z'), // receiver
      fill('M31 7 H62 V9.6 H31 Z'), // thick barrel
      fill('M31 10.2 H52 V12.2 H31 Z'), // magazine tube
      fill('M35 9.6 H47.5 V13.8 H35 Z'), // pump
      fill('M60.4 5.9 H61.6 V7 H60.4 Z'), // bead sight
      line('M21 13 V15.4 Q21 16.6 22.2 16.6 H25.4 Q26.6 16.6 26.6 15.4 V13', 1.3), // trigger guard
      line('M37.6 10.4 V13 M40.2 10.4 V13 M42.8 10.4 V13 M45.4 10.4 V13', 0.9, DETAIL), // pump grooves
    ],
  },
  'weapon:sniper': {
    viewBox: WEAPON_BOX,
    shapes: [
      fill('M1 7.6 H5 L15 8.6 V13 L5 16.8 H1 Z'), // stock
      fill('M15 8.5 H32 V13 H15 Z'), // receiver
      fill('M32 9.6 H60 V11 H32 Z'), // long thin barrel
      fill('M59.5 8.8 H63 V11.8 H59.5 Z'), // muzzle brake
      fill('M18 4.2 H34 V6.6 H18 Z'), // scope tube
      fill('M33 2.6 H38.4 V8.2 H33 Z'), // objective bell
      fill('M14.4 3.6 H18.5 V7.2 H14.4 Z'), // eyepiece
      fill('M21 6.4 H23 V8.6 H21 Z M29 6.4 H31 V8.6 H29 Z'), // scope mounts
      fill('M18 13 H22.4 L20.8 19.4 H16.2 Z'), // grip
      fill('M25 13 H29.4 V16.6 H25 Z'), // short box magazine
      line('M44 11 L40.5 18.5 M44 11 L47.5 18.5', 1.2), // bipod
      line('M34 2.6 V8.2', 0.7, DETAIL), // lens ring
    ],
  },
  'weapon:rocket': {
    viewBox: WEAPON_BOX,
    shapes: [
      fill('M1 3.8 H6.5 V14.6 H1 Z'), // rear bell
      fill('M6 5.4 H50 V13 H6 Z'), // tube
      fill('M50.8 6.4 H55 L62.4 9.2 L55 12 H50.8 Z'), // warhead
      fill('M27.5 2.4 H33 V5.4 H27.5 Z'), // sight box
      fill('M19 13 H24.4 L22.8 20.6 H17.4 Z'), // rear grip
      fill('M36 13 H40 V19.4 H36 Z'), // front grip
      line('M24.4 13 V15.2 Q24.4 16.4 25.6 16.4 H27.6', 1.2), // trigger guard
      line('M10 5.4 V13 M46 5.4 V13', 1.1, DETAIL), // tube bands
      line('M55 6.4 V12', 0.8, DETAIL), // warhead seam
    ],
  },

  'consumable:bandage': {
    viewBox: ITEM_BOX,
    shapes: [
      fill('M9 13.4 L21.6 14.6 Q23 14.8 22.8 16.2 L22.4 18.4 Q22.2 19.8 20.8 19.7 L9 18.8 Z'), // loose end
      line('M12 16.1 L21 16.9', 1.1, '#d94040'), // red stripe: it heals
      fill(circle(9.5, 11.5, 7.5)), // roll
      line(circle(9.5, 11.5, 4.2), 0.9, 'rgba(0,0,0,.22)'), // inner wrap
      fill(circle(9.5, 11.5, 1.8), DETAIL), // core
    ],
  },
  'consumable:medkit': {
    viewBox: ITEM_BOX,
    shapes: [
      line('M8.6 8 V5.6 Q8.6 4.4 9.8 4.4 H14.2 Q15.4 4.4 15.4 5.6 V8', 1.8), // handle
      fill('M3.4 8 H20.6 Q22 8 22 9.4 V19.6 Q22 21 20.6 21 H3.4 Q2 21 2 19.6 V9.4 Q2 8 3.4 8 Z'), // case
      fill('M10.5 10.4 H13.5 V13 H16.1 V16 H13.5 V18.6 H10.5 V16 H7.9 V13 H10.5 Z', '#fff'), // cross
    ],
  },
  'consumable:shieldSmall': {
    viewBox: ITEM_BOX,
    shapes: [
      fill('M9.6 3.6 H14.4 V6.4 H9.6 Z', CAP), // cork
      fill('M10.4 6 H13.6 V9.4 H10.4 Z'), // neck
      fill(circle(12, 14.6, 6)), // round flask
      fill('M12 11.2 L14.8 12.2 V14.6 Q14.8 16.9 12 18.3 Q9.2 16.9 9.2 14.6 V12.2 Z', EMBLEM), // shield mark
      line('M8.2 12.6 Q8.6 10.8 10.2 10', 0.9, GLASS), // glint
    ],
  },
  'consumable:shieldBig': {
    viewBox: ITEM_BOX,
    shapes: [
      fill('M8.6 1.6 H15.4 V4.4 H8.6 Z', CAP), // cap
      fill('M9.6 4 H14.4 V7 H9.6 Z'), // neck
      fill('M9.6 7 H14.4 L18.4 10 Q19 10.5 19 11.4 V20.4 Q19 22.6 16.8 22.6 H7.2 Q5 22.6 5 20.4 V11.4 Q5 10.5 5.6 10 Z'), // tall bottle
      fill('M12 11.4 L16 12.8 V16.2 Q16 19.4 12 21.2 Q8 19.4 8 16.2 V12.8 Z', EMBLEM), // shield mark
      line('M6.8 12.6 V18.6', 0.9, GLASS), // glint
    ],
  },
};

export const iconKey = (item) => `${item.kind}:${item.type}`;

const SVG_NS = 'http://www.w3.org/2000/svg';

/** A fresh <svg> for an inventory item, or null if there is no icon for it. */
export function createItemIcon(item) {
  const icon = ITEM_ICONS[iconKey(item)];
  if (!icon) return null;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', icon.viewBox);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', `item-icon ${item.kind}`);
  for (const s of icon.shapes) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', s.d);
    if (s.fill) path.setAttribute('fill', s.fill);
    else {
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', s.stroke);
      path.setAttribute('stroke-width', String(s.w));
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke-linejoin', 'round');
    }
    svg.append(path);
  }
  return svg;
}

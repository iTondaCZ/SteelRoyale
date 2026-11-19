// Flat front-view portraits of skins for the locker, drawn from the same box parts as the 3D
// characters (js/skins.js). The character faces −Z, so we look at it from −Z: x is mirrored,
// and parts nearer the viewer (smaller front z) are painted last.
import { RIG_REST, skinParts } from '../skins.js';

export const PORTRAIT_BOX = { x: -0.62, y: -2.36, w: 1.24, h: 2.42 };

/** Rectangles in SVG space (y down), back to front: [{ x, y, w, h, color }]. */
export function portraitRects(skin) {
  const rects = skinParts(skin).map(([node, sx, sy, sz, ox, oy, oz, key], i) => {
    const [nx, ny, nz] = RIG_REST[node];
    const cx = nx + ox;
    const cy = ny + oy;
    return { x: -cx - sx / 2, y: -(cy + sy / 2), w: sx, h: sy, front: nz + oz - sz / 2, color: skin.palette[key], i };
  });
  rects.sort((a, b) => b.front - a.front || a.i - b.i);
  return rects.map(({ x, y, w, h, color }) => ({ x, y, w, h, color }));
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const r4 = (v) => String(Math.round(v * 1e4) / 1e4);

export function createSkinPortrait(skin) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  const b = PORTRAIT_BOX;
  svg.setAttribute('viewBox', `${b.x} ${b.y} ${b.w} ${b.h}`);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'skin-portrait');
  for (const r of portraitRects(skin)) {
    const rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('x', r4(r.x));
    rect.setAttribute('y', r4(r.y));
    rect.setAttribute('width', r4(r.w));
    rect.setAttribute('height', r4(r.h));
    rect.setAttribute('fill', r.color);
    svg.append(rect);
  }
  return svg;
}

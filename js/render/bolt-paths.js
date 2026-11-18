// Lightning bolt shapes: a jagged main channel from the cloud down to the strike point, with forks
// that split off it and peter out before the ground. Plain geometry with no three.js, so it's testable;
// render/lightning.js turns the paths into glowing ribbons.

const MAIN_LEVELS = 7; // 2^7 + 1 = 129 points
const BRANCH_LEVELS = 5; // 33 points
const TWIG_LEVELS = 4; // 17 points
const MAX_BRANCHES = 7;
const MIN_BRANCHES = 3;
const TWIG_CHANCE = 0.45;

const count = (levels) => 2 ** levels + 1;
export const MAX_BOLT_POINTS = count(MAIN_LEVELS) + MAX_BRANCHES * (count(BRANCH_LEVELS) + count(TWIG_LEVELS));
export const MAX_BOLT_SEGMENTS = MAX_BOLT_POINTS - (1 + 2 * MAX_BRANCHES);

/**
 * Midpoint displacement from a to b: each pass splits every segment and nudges the new midpoint
 * sideways (and a little up or down) by half as much as the pass before. The ends never move.
 */
function jagged(a, b, levels, rough, rng) {
  let pts = [a, b];
  let amp = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) * rough;
  for (let l = 0; l < levels; l++) {
    const next = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i];
      const q = pts[i + 1];
      next.push(
        {
          x: (p.x + q.x) / 2 + (rng() * 2 - 1) * amp,
          y: (p.y + q.y) / 2 + (rng() * 2 - 1) * amp * 0.3,
          z: (p.z + q.z) / 2 + (rng() * 2 - 1) * amp,
        },
        q,
      );
    }
    pts = next;
    amp *= 0.5;
  }
  return pts;
}

/** A fork leaving `points` somewhere in [lo, hi] of its length, heading down and outward. */
function fork(points, lo, hi, groundY, levels, rng) {
  const from = points[Math.floor((lo + rng() * (hi - lo)) * (points.length - 1))];
  const drop = (from.y - groundY) * (0.2 + rng() * 0.35);
  const out = drop * (0.35 + rng() * 0.6);
  const a = rng() * Math.PI * 2;
  const to = { x: from.x + Math.cos(a) * out, y: from.y - drop, z: from.z + Math.sin(a) * out };
  return jagged(from, to, levels, 0.16, rng);
}

/**
 * rng() → [0, 1); top: where the bolt leaves the cloud; ground: where it strikes.
 * Returns [{ points, width, bright, taper }], main channel first. width/bright are relative (main = 1);
 * taper paths get thinner and dimmer toward their tips.
 */
export function boltPaths(rng, top, ground) {
  const main = jagged(top, ground, MAIN_LEVELS, 0.11, rng);
  const paths = [{ points: main, width: 1, bright: 1, taper: false }];
  const branches = MIN_BRANCHES + Math.floor(rng() * (MAX_BRANCHES - MIN_BRANCHES + 1));
  for (let i = 0; i < branches; i++) {
    const branch = fork(main, 0.08, 0.7, ground.y, BRANCH_LEVELS, rng);
    paths.push({ points: branch, width: 0.45, bright: 0.6, taper: true });
    if (rng() < TWIG_CHANCE) {
      paths.push({ points: fork(branch, 0.2, 0.7, ground.y, TWIG_LEVELS, rng), width: 0.25, bright: 0.38, taper: true });
    }
  }
  return paths;
}

// Seeded random numbers (mulberry32) so a seed always rebuilds the same match.

export function createRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const randRange = (rng, lo, hi) => lo + (hi - lo) * rng();
export const randInt = (rng, lo, hi) => Math.floor(randRange(rng, lo, hi + 1));
export const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];

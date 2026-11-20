// rng.js — a tiny deterministic random generator (mulberry32) so the city of
// Ember Bay is laid out identically for a given seed. Screenshot modes rely on
// this: seed 1 always builds the same streets, palms and parked cars.

export function createRng(seed) {
  let state = (seed >>> 0) || 1;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    // Float in [min, max).
    range(min, max) {
      return min + next() * (max - min);
    },
    // Integer in [min, max] inclusive.
    int(min, max) {
      return Math.floor(min + next() * (max - min + 1));
    },
    // True with probability p.
    chance(p) {
      return next() < p;
    },
    // Random element of an array.
    pick(list) {
      return list[Math.floor(next() * list.length)];
    },
  };
}

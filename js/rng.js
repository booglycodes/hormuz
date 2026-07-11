// rng.js — deterministic, seedable pseudo-random number generator.
//
// Uses mulberry32: tiny, fast, good enough for a board game and fully
// reproducible from a 32-bit seed. The RNG state is a plain object so it
// can be serialized as part of the game state and carried across the wire.

/**
 * Create an RNG state from a numeric or string seed.
 * @param {number|string} seed
 * @returns {{ s: number }} serializable RNG state
 */
export function makeRng(seed) {
  let n;
  if (typeof seed === 'number') {
    n = seed >>> 0;
  } else {
    // hash a string seed (FNV-1a) into a 32-bit int
    n = 2166136261 >>> 0;
    const str = String(seed);
    for (let i = 0; i < str.length; i++) {
      n ^= str.charCodeAt(i);
      n = Math.imul(n, 16777619);
    }
    n = n >>> 0;
  }
  return { s: n >>> 0 };
}

/**
 * Advance the RNG and return a float in [0, 1). Mutates the passed state.
 * @param {{s:number}} state
 * @returns {number}
 */
export function nextFloat(state) {
  state.s = (state.s + 0x6d2b79f5) >>> 0;
  let t = state.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/**
 * Return an integer in [0, max). Uses rejection sampling to avoid modulo bias.
 * @param {{s:number}} state
 * @param {number} max exclusive upper bound (must be >= 1)
 * @returns {number}
 */
export function nextInt(state, max) {
  if (max <= 0) throw new Error('nextInt: max must be >= 1');
  // Rejection sampling over the 2^32 range to remove modulo bias.
  const limit = Math.floor(4294967296 / max) * max;
  let r;
  do {
    state.s = (state.s + 0x6d2b79f5) >>> 0;
    let t = state.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    r = (t ^ (t >>> 14)) >>> 0;
  } while (r >= limit);
  return r % max;
}

/**
 * Return a deterministically shuffled copy of an array (Fisher–Yates).
 * Does not mutate the input array; does mutate the RNG state.
 * @template T
 * @param {{s:number}} state
 * @param {T[]} arr
 * @returns {T[]}
 */
export function shuffle(state, arr) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = nextInt(state, i + 1);
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

/** Deep-clone an RNG state. */
export function cloneRng(state) {
  return { s: state.s >>> 0 };
}

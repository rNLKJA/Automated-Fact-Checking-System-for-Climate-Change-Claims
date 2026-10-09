/**
 * A small, seedable pseudo-random number generator so that every resample and
 * every sampled subset on the site can be reproduced from its displayed seed.
 *
 * mulberry32 is a 32-bit generator with a full 2^32 period. It is not
 * cryptographic, which is fine here: it only drives bootstrap resampling and
 * claim sampling. `scripts/stats_reference.py` re-implements it in Python so
 * the vitest suite can check bootstrap intervals against numpy digit for digit.
 */

export type Rng = () => number;

/** mulberry32: returns floats in [0, 1) from a 32-bit integer seed. */
export function mulberry32(seed: number): Rng {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A uniform integer in [0, n). */
export function randomInt(rng: Rng, n: number): number {
  return Math.floor(rng() * n);
}

/**
 * k items drawn without replacement, in draw order (a partial Fisher-Yates
 * shuffle of a copy, so the input is untouched). k is clamped to the input size.
 */
export function sampleWithoutReplacement<T>(items: readonly T[], k: number, seed: number): T[] {
  const rng = mulberry32(seed);
  const pool = [...items];
  const m = Math.max(0, Math.min(k, pool.length));
  for (let i = 0; i < m; i++) {
    const j = i + randomInt(rng, pool.length - i);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, m);
}

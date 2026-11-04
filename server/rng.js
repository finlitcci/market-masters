import crypto from 'node:crypto';

export const newSeed = () => crypto.randomBytes(16).toString('hex');

/** Deterministic PRNG (mulberry32) seeded from any string via SHA-256. */
export function rngFromString(str) {
  let a = crypto.createHash('sha256').update(String(str)).digest().readUInt32LE(0);
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal draw (Box-Muller). */
export function gaussian(rand) {
  const u = 1 - rand();
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Fisher-Yates shuffle that returns a new array, driven by a seed string. */
export function seededShuffle(arr, key) {
  const rand = rngFromString(key);
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

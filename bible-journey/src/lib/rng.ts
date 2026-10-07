/**
 * A small seeded random number generator, mulberry32.
 *
 * Seeded rather than `Math.random`, because the celebrations have to be the
 * same celebration every time they are measured. The particle tests ask the
 * same question twice and expect the same answer, and the sound's offline
 * measurement renders the fire's crackle and the hall's echo from it, so a
 * peak level read today is the peak level that ships.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

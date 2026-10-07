import { describe, expect, it } from 'vitest';
import { alive, ember, fade, leaf, spark, step, type Particle } from './particles';
import { mulberry32 } from './rng';

/** Runs a particle for `seconds` at `hz`, the way a display would. */
function run(p: Particle, seconds: number, hz: number): Particle {
  const q = { ...p };
  const frames = Math.round(seconds * hz);
  for (let i = 0; i < frames; i++) step(q, 1 / hz);
  return q;
}

describe('the particles', () => {
  /*
   * Seeded, so the same moment throws the same fire. A celebration that looked
   * right once and wrong the next time would be impossible to judge.
   */
  it('throws the same particles from the same seed', () => {
    const a = mulberry32(7);
    const b = mulberry32(7);
    for (let i = 0; i < 20; i++) expect(ember(a, 100, 100, 10)).toEqual(ember(b, 100, 100, 10));
  });

  it('lets embers rise and leaf fall', () => {
    const rng = mulberry32(1);
    for (let i = 0; i < 50; i++) {
      const e = ember(rng, 0, 0, 0);
      expect(run(e, 0.8, 60).y).toBeLessThan(e.y);
      const l = leaf(rng, 375, 812);
      expect(run(l, 0.8, 60).y).toBeGreaterThan(l.y);
    }
  });

  it('throws sparks in every direction, not in a fan', () => {
    const rng = mulberry32(3);
    const quadrants = new Set<string>();
    for (let i = 0; i < 64; i++) {
      const s = spark(rng, 0, 0);
      // The lift is added after the angle, so read the direction without it.
      quadrants.add(`${Math.sign(s.vx)}${Math.sign(s.vy + 60)}`);
    }
    expect(quadrants.size).toBe(4);
  });

  /*
   * The canvas stops drawing once nothing is alive, so a particle that never
   * died would keep an animation frame running long after the moment had gone.
   */
  it('lets every particle die, and fade to nothing as it does', () => {
    const rng = mulberry32(9);
    const all = [
      ...Array.from({ length: 30 }, () => ember(rng, 0, 0, 5)),
      ...Array.from({ length: 30 }, () => spark(rng, 0, 0)),
      ...Array.from({ length: 30 }, () => leaf(rng, 375, 812)),
    ];
    for (const p of all) {
      expect(p.life).toBeGreaterThan(0);
      expect(p.life).toBeLessThanOrEqual(6.2);
      const end = run(p, p.life + 0.05, 60);
      expect(alive(end)).toBe(false);
      expect(fade(end)).toBe(0);
    }
  });

  it('never draws a particle brighter than fully opaque, or darker than gone', () => {
    const rng = mulberry32(11);
    for (let i = 0; i < 40; i++) {
      const p = ember(rng, 0, 0, 0);
      for (let t = 0; t < p.life; t += 0.05) {
        const f = fade(run(p, t, 60));
        expect(f).toBeGreaterThanOrEqual(0);
        expect(f).toBeLessThanOrEqual(1);
      }
    }
  });

  /*
   * An iPhone draws at 120Hz and most laptops at 60. Velocities are per second
   * and `step` takes the frame's real length, so both should send an ember to
   * the same place; a per-frame constant would make the fire twice as lively
   * on the better phone.
   */
  it('goes the same place at 60Hz as at 120Hz', () => {
    const rng = mulberry32(5);
    for (const make of [() => ember(rng, 0, 0, 4), () => spark(rng, 0, 0), () => leaf(rng, 375, 812)]) {
      const p = make();
      const slow = run(p, 1, 60);
      const fast = run(p, 1, 120);
      expect(Math.abs(slow.x - fast.x)).toBeLessThan(3);
      expect(Math.abs(slow.y - fast.y)).toBeLessThan(3);
    }
  });
});

/**
 * The embers off the streak's flame and the gold leaf over a finished book.
 *
 * Pure numbers, no canvas, so the physics can be tested without a browser:
 * `CelebrationParticles` owns the drawing and nothing else. Every particle is
 * born with a finite life and `alive` is the only thing that keeps it, so a
 * celebration can never leave something running after it has gone.
 *
 * **Velocities are per second and `step` takes the frame's real duration**, so
 * an iPhone at 120Hz and a laptop at 60 throw the same embers the same height.
 * A per-frame constant would make the fire twice as lively on the better phone.
 */

export type ParticleKind = 'ember' | 'spark' | 'leaf';

export type Particle = {
  kind: ParticleKind;
  x: number;
  y: number;
  /** Pixels per second. */
  vx: number;
  vy: number;
  /** Seconds lived, and seconds it gets. */
  age: number;
  life: number;
  size: number;
  /** A leaf's flip, in radians, and how fast it turns over. Unused otherwise. */
  spin: number;
  turn: number;
  /** Side to side drift, so nothing rises or falls on a ruler. */
  sway: number;
  phase: number;
  /** Zero to one: which shade of the palette it is drawn in. */
  tone: number;
};

export type Rng = () => number;

const between = (rng: Rng, lo: number, hi: number) => lo + rng() * (hi - lo);

/** One ember off the flame at (x, y), rising and wandering as it cools. */
export function ember(rng: Rng, x: number, y: number, spread: number): Particle {
  return {
    kind: 'ember',
    x: x + between(rng, -spread, spread),
    y: y + between(rng, -spread * 0.4, spread * 0.4),
    vx: between(rng, -14, 14),
    vy: between(rng, -120, -55),
    age: 0,
    life: between(rng, 1.1, 2.3),
    size: between(rng, 1.1, 2.6),
    spin: 0,
    turn: 0,
    sway: between(rng, 10, 34),
    phase: between(rng, 0, Math.PI * 2),
    tone: rng(),
  };
}

/** One spark thrown out of (x, y) in any direction, for the moment a count lands. */
export function spark(rng: Rng, x: number, y: number): Particle {
  const angle = between(rng, 0, Math.PI * 2);
  const speed = between(rng, 160, 380);
  return {
    kind: 'spark',
    x,
    y,
    vx: Math.cos(angle) * speed,
    // A little lift, so the burst blooms upward before it falls.
    vy: Math.sin(angle) * speed - 60,
    age: 0,
    life: between(rng, 0.55, 1.15),
    size: between(rng, 1.2, 2.4),
    spin: 0,
    turn: 0,
    sway: 0,
    phase: 0,
    tone: rng(),
  };
}

/**
 * One leaf of gold, somewhere above the top edge so a handful enter over a
 * couple of seconds rather than all on the same frame.
 */
export function leaf(rng: Rng, width: number, height: number): Particle {
  return {
    kind: 'leaf',
    x: between(rng, 0, width),
    y: between(rng, -height * 0.5, -12),
    vx: 0,
    vy: between(rng, 34, 70),
    age: 0,
    life: between(rng, 4.2, 6.2),
    size: between(rng, 4, 8.5),
    spin: between(rng, 0, Math.PI * 2),
    turn: between(rng, 2.4, 6.2) * (rng() < 0.5 ? -1 : 1),
    sway: between(rng, 14, 40),
    phase: between(rng, 0, Math.PI * 2),
    tone: rng(),
  };
}

/** Advances one particle by `dt` seconds, in place. */
export function step(p: Particle, dt: number): void {
  p.age += dt;
  switch (p.kind) {
    case 'ember':
      // Heat rises and keeps rising, a little faster as it goes, wandering.
      p.vy -= 18 * dt;
      p.x += (p.vx + Math.sin(p.age * 3.1 + p.phase) * p.sway) * dt;
      p.y += p.vy * dt;
      break;
    case 'spark': {
      // Thrown, slowed by the air, then pulled down.
      const drag = Math.exp(-3.4 * dt);
      p.vx *= drag;
      p.vy = p.vy * drag + 220 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      break;
    }
    case 'leaf':
      // Falls at its own pace, rocking side to side and turning over.
      p.spin += p.turn * dt;
      p.x += Math.sin(p.age * 1.7 + p.phase) * p.sway * dt;
      p.y += p.vy * dt;
      break;
  }
}

export function alive(p: Particle): boolean {
  return p.age < p.life;
}

/** How visible it is now: in quickly, out slowly, and never outside 0 to 1. */
export function fade(p: Particle): number {
  const t = p.age / p.life;
  if (!(t > 0) || t >= 1) return 0;
  return Math.min(1, t / 0.12, (1 - t) / 0.4);
}

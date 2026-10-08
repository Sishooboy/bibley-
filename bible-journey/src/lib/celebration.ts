/**
 * When everything in a celebration happens, in milliseconds from the cue.
 *
 * **One table, read by both halves of the moment.** `StreakCelebration` hands
 * these to the stylesheet as custom properties, and `sound.ts` schedules its
 * voices off the same numbers divided by a thousand. They used to be written
 * twice, once as delays in the CSS and once as a comment above each voice, and
 * "holds, reels and voices move together" was a rule kept by care. Now there is
 * only one copy to move. `celebration.test.ts` pins the order things happen in,
 * and `sound.test.ts` pins that the chord lands on `land` and nothing rings on
 * past the hold.
 *
 * Imports nothing, so the sound module can read it without pulling a component
 * in behind it.
 */

/** How long the scrim takes to leave. The exit starts this long before the hold ends. */
export const FADE_OUT_MS = 420;

/**
 * The streak: a match is struck, a flame catches, the number rolls in under it,
 * and the week it belongs to lights up a day at a time.
 */
export const STREAK = {
  /** A point of light where the flame will be. */
  spark: 140,
  /** The flame catches and the embers start rising. */
  ignite: 340,
  /** The last reel locks. Each reel to its left locked one stagger earlier. */
  land: 1960,
  /** How long one reel turns for. */
  roll: 1250,
  stagger: 190,
  label: 2180,
  week: 2320,
  /** The newest day of the run catches, last of the seven. */
  today: 2700,
  sub: 2900,
  hold: 4200,
} as const;

/**
 * A streak that lands on a number scripture keeps. It is the streak with a
 * name added, so it carries every streak timing and starts where that ends.
 */
export const MILESTONE = {
  rule: 3080,
  name: 3160,
  line: 3440,
  refs: 3640,
  hold: 6000,
} as const;

/**
 * A finished book: the pages riffle shut, the cross comes down through the
 * light, the name rises, and the book's own square on the shelf catches at the
 * moment the count lands.
 */
export const BOOK = {
  cross: 160,
  /** The cross lands and the book closes. Rings and rays leave it. */
  close: 700,
  eyebrow: 920,
  name: 1060,
  rule: 1560,
  /** Light crossing the name once, the move the today button makes. */
  sheen: 1820,
  /** The shelf of books arrives, a diagonal wave from the top left. */
  grid: 1780,
  land: 3360,
  roll: 1300,
  stagger: 200,
  label: 3580,
  sub: 3800,
  hold: 5800,
} as const;

/**
 * The whole plan, finished. Once in a reading life, so it is the longest and
 * the slowest: light comes up from the foot of the screen like a dawn, the
 * cross rises into it, the plan's name arrives, and then every book on the
 * shelf catches in printed order, Genesis to Revelation, with a bell for every
 * few books, before the count of chapters lands.
 */
export const PLAN = {
  dawn: 200,
  cross: 520,
  /** The cross lands. The rays fan out from it. */
  close: 1300,
  eyebrow: 1560,
  name: 1740,
  rule: 2240,
  sheen: 2420,
  /** The shelf arrives as outlines, every book still dark. */
  grid: 2300,
  /** The first book catches. */
  wave: 2600,
  /**
   * How long the whole shelf takes to catch, **whatever the number of books**.
   * The step between squares is this divided by the count, so 27 books and 73
   * books both finish the wave at the same moment and the bells, which cannot
   * know the count, can follow it exactly.
   */
  waveFor: 1600,
  land: 4800,
  roll: 1500,
  stagger: 180,
  label: 5060,
  sub: 5320,
  hold: 8200,
} as const;

/**
 * Under reduced motion there is nothing to wait for, so each leaves sooner.
 * The milestone still holds longest of the everyday ones, because it is the
 * one with words to read; the plan holds longest of all because it is the
 * plan.
 */
export const CALM_HOLD_MS = { streak: 2400, milestone: 3800, book: 3000, plan: 4600 } as const;

export type CelebrationKind = keyof typeof CALM_HOLD_MS;

export type ReelTiming = { land: number; roll: number; stagger: number };

export function holdFor(kind: CelebrationKind, calm: boolean): number {
  if (calm) return CALM_HOLD_MS[kind];
  if (kind === 'plan') return PLAN.hold;
  if (kind === 'book') return BOOK.hold;
  return kind === 'milestone' ? MILESTONE.hold : STREAK.hold;
}

/** When the scrim starts to leave, so the fade finishes exactly as the hold does. */
export function exitFor(kind: CelebrationKind, calm: boolean): number {
  return holdFor(kind, calm) - FADE_OUT_MS;
}

/**
 * When reel `index` of `count` starts turning.
 *
 * **Counted back from the landing rather than forward from a start**, so the
 * last reel locks at `land` whatever the number of digits. That is what lets
 * the sound put its chord on `land` without being told how long the number is,
 * and it is what makes a three digit streak feel the same length as a one digit
 * one: the extra reels start earlier rather than ending later.
 */
export function reelStart(index: number, count: number, t: ReelTiming): number {
  return Math.max(0, t.land - t.roll - (count - 1 - index) * t.stagger);
}

/** When reel `index` of `count` locks, which is where its click goes. */
export function reelLand(index: number, count: number, t: ReelTiming): number {
  return reelStart(index, count, t) + t.roll;
}

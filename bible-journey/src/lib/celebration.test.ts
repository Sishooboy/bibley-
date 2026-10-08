import { describe, expect, it } from 'vitest';
import {
  BOOK,
  CALM_HOLD_MS,
  FADE_OUT_MS,
  MILESTONE,
  PLAN,
  STREAK,
  exitFor,
  holdFor,
  reelLand,
  reelStart,
} from './celebration';

/** True when every value is later than the one before it. */
const rising = (xs: number[]) => xs.every((x, i) => i === 0 || x > xs[i - 1]);

describe('the celebration timeline', () => {
  /*
   * The order is the story. A count that lands before its flame has caught,
   * or a book's square that lights before the shelf has arrived, is a moment
   * told out of order, and nothing on screen would throw to say so.
   */
  it('tells the streak in order', () => {
    expect(
      rising([
        STREAK.spark,
        STREAK.ignite,
        STREAK.land,
        STREAK.label,
        STREAK.week,
        STREAK.today,
        STREAK.sub,
        exitFor('streak', false),
        STREAK.hold,
      ]),
    ).toBe(true);
  });

  it('names the milestone only after the streak has finished arriving', () => {
    expect(
      rising([
        STREAK.sub,
        MILESTONE.rule,
        MILESTONE.name,
        MILESTONE.line,
        MILESTONE.refs,
        exitFor('milestone', false),
        MILESTONE.hold,
      ]),
    ).toBe(true);
  });

  it('tells the book in order', () => {
    expect(
      rising([
        BOOK.cross,
        BOOK.close,
        BOOK.eyebrow,
        BOOK.name,
        BOOK.rule,
        BOOK.land,
        BOOK.label,
        BOOK.sub,
        exitFor('book', false),
        BOOK.hold,
      ]),
    ).toBe(true);
    // The shelf has to have arrived before its square can catch.
    expect(BOOK.grid).toBeLessThan(BOOK.land - 600);
  });

  /*
   * The plan's whole shelf has to have caught before the count lands, or the
   * last books would still be lighting under a number that says they are all
   * read. And the name has to have risen before the first book catches, so
   * the reader knows what the shelf is the shelf of.
   */
  it('tells the plan in order, and finishes the shelf before the count lands', () => {
    expect(
      rising([
        PLAN.dawn,
        PLAN.cross,
        PLAN.close,
        PLAN.eyebrow,
        PLAN.name,
        PLAN.rule,
        PLAN.wave,
        PLAN.land,
        PLAN.label,
        PLAN.sub,
        exitFor('plan', false),
        PLAN.hold,
      ]),
    ).toBe(true);
    expect(PLAN.grid).toBeLessThan(PLAN.wave);
    expect(PLAN.wave + PLAN.waveFor).toBeLessThan(PLAN.land - 300);
  });

  it('starts the scrim leaving exactly one fade before the hold ends', () => {
    for (const kind of ['streak', 'milestone', 'book', 'plan'] as const) {
      for (const calm of [false, true]) {
        expect(exitFor(kind, calm) + FADE_OUT_MS).toBe(holdFor(kind, calm));
      }
    }
  });

  it('leaves sooner under reduced motion, and the plan still holds longest', () => {
    for (const kind of ['streak', 'milestone', 'book', 'plan'] as const) {
      expect(holdFor(kind, true)).toBeLessThan(holdFor(kind, false));
    }
    expect(CALM_HOLD_MS.milestone).toBeGreaterThan(CALM_HOLD_MS.streak);
    for (const kind of ['streak', 'milestone', 'book'] as const) {
      expect(holdFor('plan', false)).toBeGreaterThan(holdFor(kind, false));
      expect(holdFor('plan', true)).toBeGreaterThan(holdFor(kind, true));
    }
  });

  /*
   * The words that arrive last still need time to be read before the scrim
   * goes. A second and a half is about what "Your best yet" or three
   * references take at a glance.
   */
  it('leaves time to read whatever arrived last', () => {
    expect(exitFor('streak', false) - STREAK.sub).toBeGreaterThanOrEqual(800);
    expect(exitFor('milestone', false) - MILESTONE.refs).toBeGreaterThanOrEqual(1500);
    expect(exitFor('book', false) - BOOK.sub).toBeGreaterThanOrEqual(1200);
    expect(exitFor('plan', false) - PLAN.sub).toBeGreaterThanOrEqual(2000);
  });
});

describe('the reels', () => {
  /*
   * The property the sound depends on. The chord is scheduled on `land`
   * without knowing the number, which is only right if the last reel locks
   * there whatever the number is.
   */
  it('locks the last reel on the landing however many digits there are', () => {
    for (const t of [STREAK, BOOK, PLAN]) {
      for (let count = 1; count <= 4; count++) {
        expect(reelLand(count - 1, count, t)).toBe(t.land);
      }
    }
  });

  it('locks left to right, one stagger apart', () => {
    for (const t of [STREAK, BOOK, PLAN]) {
      const lands = [0, 1, 2].map((i) => reelLand(i, 3, t));
      expect(lands[1] - lands[0]).toBe(t.stagger);
      expect(lands[2] - lands[1]).toBe(t.stagger);
    }
  });

  it('never starts a reel before the moment does', () => {
    for (const t of [STREAK, BOOK, PLAN]) {
      for (let count = 1; count <= 4; count++) {
        expect(reelStart(0, count, t)).toBeGreaterThanOrEqual(0);
      }
    }
  });

  /* A streak's reels turn under a flame that is already alight. */
  it('starts turning a three digit streak after the match is struck', () => {
    expect(reelStart(0, 3, STREAK)).toBeGreaterThan(STREAK.spark);
  });

  /* A book's reels turn after its name has risen, so the two never compete. */
  it('starts turning a book count after the name', () => {
    expect(reelStart(0, 2, BOOK)).toBeGreaterThan(BOOK.name);
  });
});

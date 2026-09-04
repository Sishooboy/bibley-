import { describe, expect, it } from 'vitest';
import { countWords, digitsOf, readingMinutes } from './format';

/**
 * Feeds the streak celebration's slot reels, one entry per reel, so "12" is
 * two reels reading left to right rather than one reel and a stray digit.
 */
describe('digitsOf', () => {
  it('splits a multi-digit streak into one entry per reel', () => {
    expect(digitsOf(12)).toEqual([1, 2]);
    expect(digitsOf(365)).toEqual([3, 6, 5]);
  });

  it('is one reel for a single digit', () => {
    expect(digitsOf(1)).toEqual([1]);
    expect(digitsOf(9)).toEqual([9]);
  });

  it('floors and never goes negative, since a streak cannot be either', () => {
    expect(digitsOf(4.9)).toEqual([4]);
    expect(digitsOf(-3)).toEqual([0]);
    expect(digitsOf(0)).toEqual([0]);
  });
});

/** What the today button promises. A promise that is wrong is worse than none. */
describe('readingMinutes', () => {
  it('rounds to whole minutes at a slow reading pace', () => {
    expect(readingMinutes(200)).toBe(1);
    expect(readingMinutes(500)).toBe(3);
    expect(readingMinutes(2400)).toBe(12);
  });

  it('never promises less than a minute', () => {
    expect(readingMinutes(0)).toBe(1);
    expect(readingMinutes(40)).toBe(1);
  });
});

describe('countWords', () => {
  it('counts across verses and skips the ones the translation has nothing behind', () => {
    expect(countWords(['In the beginning God', null, 'and the earth'])).toBe(7);
  });

  it('is not fooled by runs of whitespace', () => {
    expect(countWords(['  one   two  '])).toBe(2);
  });
});

import { describe, expect, it } from 'vitest';
import { digitsOf } from './format';

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

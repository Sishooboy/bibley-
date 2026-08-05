import { describe, expect, it } from 'vitest';
import { DOUBLE_TAP_MS, interpretTap, isDoubleTap, rangeBetween } from './tapSelect';

describe('spotting a double tap', () => {
  it('needs the same chapter twice, close together', () => {
    expect(isDoubleTap({ chapter: 5, at: 1000 }, 5, 1200)).toBe(true);
  });

  it('is not fooled by two different chapters in quick succession', () => {
    expect(isDoubleTap({ chapter: 5, at: 1000 }, 6, 1050)).toBe(false);
  });

  it('is not fooled by the same chapter tapped much later', () => {
    expect(isDoubleTap({ chapter: 5, at: 1000 }, 5, 1000 + DOUBLE_TAP_MS + 1)).toBe(false);
  });

  it('treats the very first tap as a single one', () => {
    expect(isDoubleTap(null, 5, 1000)).toBe(false);
  });
});

describe('rangeBetween', () => {
  it('runs from the lower to the higher, whichever was tapped first', () => {
    expect(rangeBetween(3, 7)).toEqual([3, 4, 5, 6, 7]);
    expect(rangeBetween(7, 3)).toEqual([3, 4, 5, 6, 7]);
  });

  it('a range of one is just that chapter', () => {
    expect(rangeBetween(9, 9)).toEqual([9]);
  });
});

/**
 * The whole interaction, read as a sequence of taps. Dragging was replaced
 * because a vertical drag on a phone is how you scroll, and nothing about
 * holding still first made that comfortable.
 */
describe('what a tap means', () => {
  it('a lone tap toggles one chapter', () => {
    expect(interpretTap(4, null, null, 1000)).toEqual({ kind: 'toggle', chapter: 4 });
  });

  it('a double tap with no range going sets one end', () => {
    expect(interpretTap(4, { chapter: 4, at: 900 }, null, 1000)).toEqual({
      kind: 'anchor',
      chapter: 4,
    });
  });

  it('a double tap with an end already set takes everything between', () => {
    expect(interpretTap(9, { chapter: 9, at: 900 }, 4, 1000)).toEqual({
      kind: 'range',
      chapters: [4, 5, 6, 7, 8, 9],
    });
  });

  it('works backwards, finishing above the chapter it started on', () => {
    expect(interpretTap(2, { chapter: 2, at: 900 }, 6, 1000)).toEqual({
      kind: 'range',
      chapters: [2, 3, 4, 5, 6],
    });
  });

  it('a single tap while a range is half made just toggles, leaving the end set', () => {
    // The anchor survives, so a stray tap does not lose the range you began.
    expect(interpretTap(12, null, 4, 1000)).toEqual({ kind: 'toggle', chapter: 12 });
  });

  it('double tapping the same chapter twice closes a range of one', () => {
    expect(interpretTap(4, { chapter: 4, at: 900 }, 4, 1000)).toEqual({
      kind: 'range',
      chapters: [4],
    });
  });
});

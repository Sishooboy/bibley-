import { describe, expect, it } from 'vitest';
import { chooseCue, play, primeSound, setSoundEnabled, tourRung, type CueSignal } from './sound';

function signal(over: Partial<CueSignal> = {}): CueSignal {
  return {
    booksFinished: 0,
    planFinished: false,
    streakBefore: 3,
    streakAfter: 3,
    chaptersMarked: 1,
    ...over,
  };
}

describe('chooseCue', () => {
  it('says nothing for a change that marked nothing', () => {
    expect(chooseCue(signal({ chaptersMarked: 0 }))).toBeNull();
  });

  it('ticks for an ordinary mark', () => {
    expect(chooseCue(signal())).toBe('chapter');
  });

  it('rings for a finished book', () => {
    expect(chooseCue(signal({ booksFinished: 1 }))).toBe('book');
  });

  /*
   * One tap, one sound. Finishing a book on a day that also extends a streak
   * used to be three cues at once, which arrives as noise rather than as three
   * pieces of good news.
   */
  it('plays only the largest thing that happened', () => {
    const everything: Partial<CueSignal> = {
      planFinished: true,
      booksFinished: 2,
      streakBefore: 3,
      streakAfter: 4,
      chaptersMarked: 5,
    };
    expect(chooseCue(signal(everything))).toBe('plan');
    expect(chooseCue(signal({ ...everything, planFinished: false }))).toBe('book');
    expect(chooseCue(signal({ ...everything, planFinished: false, booksFinished: 0 }))).toBe(
      'streak',
    );
    expect(
      chooseCue(
        signal({ ...everything, planFinished: false, booksFinished: 0, streakAfter: 3 }),
      ),
    ).toBe('chapter');
  });

  /*
   * The streak sound is for the moment the streak grows, and nothing else. A
   * second chapter on a day already read leaves it where it was, and backdating
   * a chapter that fills no gap does too.
   */
  it('only celebrates a streak that actually went up', () => {
    expect(chooseCue(signal({ streakBefore: 4, streakAfter: 4 }))).toBe('chapter');
    expect(chooseCue(signal({ streakBefore: 4, streakAfter: 5 }))).toBe('streak');
  });

  it('stays quiet when a backdated mark revives a streak from nothing', () => {
    // Zero to one is still an increase, and is worth the sound: it is the day
    // the streak starts again.
    expect(chooseCue(signal({ streakBefore: 0, streakAfter: 1 }))).toBe('streak');
  });

  it('does not ring the streak when a mark shortens it', () => {
    // Not reachable by marking, but the ladder should not fire on a decrease.
    expect(chooseCue(signal({ streakBefore: 6, streakAfter: 2 }))).toBe('chapter');
  });

  it('keeps the whole track above a book finished in the same tap', () => {
    // The last chapter of a track necessarily finishes its book too, so these
    // two always arrive together and the larger one has to win.
    expect(chooseCue(signal({ planFinished: true, booksFinished: 1 }))).toBe('plan');
  });
});

/**
 * There is no Web Audio in jsdom, and there is none in an old browser either.
 * Both have to end in silence rather than an exception, because every one of
 * these calls sits on the path that records reading.
 */
describe('the synth without an audio context', () => {
  it('plays nothing and throws nothing', () => {
    expect(() => play('book')).not.toThrow();
    expect(() => play('chapter')).not.toThrow();
    expect(() => primeSound()).not.toThrow();
  });

  it('takes the preference without needing a context', () => {
    expect(() => setSoundEnabled(false)).not.toThrow();
    expect(() => play('plan')).not.toThrow();
    setSoundEnabled(true);
  });
});


describe('the tour ladder', () => {
  const climb = (total: number) =>
    Array.from({ length: total - 1 }, (_, i) => tourRung(i, total));

  /*
   * The pin that lets a stop be added at all. Six stops rang one rung each and
   * that scoring was measured, so a change to the spread has to leave it
   * untouched or the tour quietly sounds different for everybody who already
   * knows it.
   */
  it('leaves the six stop tour ringing exactly what it always rang', () => {
    expect(climb(6)).toEqual([220, 329.63, 440, 659.25, 880]);
  });

  it('climbs without ever going backwards', () => {
    for (const total of [4, 5, 6, 7, 8, 9]) {
      const rungs = climb(total);
      for (let i = 1; i < rungs.length; i += 1) {
        expect(rungs[i], `total ${total}, stop ${i}`).toBeGreaterThanOrEqual(rungs[i - 1]);
      }
    }
  });

  /*
   * The reason this exists. Clamping repeated the top rung on the stop right
   * before the arrival, and the arrival is built on A: the climb stalled
   * exactly where it should have been tightest.
   */
  it('never repeats the rung immediately before the arrival', () => {
    for (const total of [6, 7, 8, 9]) {
      const rungs = climb(total);
      expect(rungs.at(-1), `total ${total}`).not.toBe(rungs.at(-2));
    }
  });

  it('puts a seven stop tour repeat in the middle, where a plateau passes for pacing', () => {
    expect(climb(7)).toEqual([220, 329.63, 440, 440, 659.25, 880]);
  });

  it('always starts the climb on the bottom rung, whatever the length', () => {
    for (const total of [4, 5, 6, 7, 8, 9]) {
      expect(climb(total)[0], `total ${total}`).toBe(220);
    }
  });

  it('always ends the climb on the top rung, whatever the length', () => {
    for (const total of [4, 5, 6, 7, 8, 9]) {
      expect(climb(total).at(-1), `total ${total}`).toBe(880);
    }
  });
});

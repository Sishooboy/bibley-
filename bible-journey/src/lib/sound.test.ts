import { describe, expect, it } from 'vitest';
import { chooseCue, play, primeSound, setSoundEnabled, type CueSignal } from './sound';

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

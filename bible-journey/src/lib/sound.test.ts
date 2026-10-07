import { describe, expect, it } from 'vitest';
import { BOOK, MILESTONE, STREAK, reelLand } from './celebration';
import {
  chooseCue,
  play,
  primeSound,
  schedule,
  setSoundEnabled,
  tourRung,
  type CueSignal,
  type Playable,
} from './sound';

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

/* ── The celebrations against their screens ─────────────── */

type Struck = { kind: 'osc' | 'buffer'; at: number; until: number; freq: number };

/**
 * Just enough of an audio context to record what a voice schedules: when each
 * oscillator and noise source starts and stops, and the first pitch an
 * oscillator is given. No sound is made. jsdom has no Web Audio, and the
 * question here is timing, which this answers exactly where a render would
 * only answer it to the nearest sample.
 */
function recorder() {
  const struck: Struck[] = [];
  const param = (onSet?: (v: number) => void) => {
    let v = 0;
    return {
      get value() {
        return v;
      },
      set value(x: number) {
        v = x;
        onSet?.(x);
      },
      setValueAtTime(x: number) {
        onSet?.(x);
        return this;
      },
      linearRampToValueAtTime() {
        return this;
      },
      exponentialRampToValueAtTime() {
        return this;
      },
    };
  };
  const node = () => ({ connect: <T>(target: T) => target });
  const source = (kind: Struck['kind'], extra: object) => {
    const s: Struck = { kind, at: NaN, until: NaN, freq: NaN };
    struck.push(s);
    return {
      ...node(),
      ...extra,
      start: (t: number) => {
        s.at = t;
      },
      stop: (t: number) => {
        s.until = t;
      },
      record: s,
    };
  };
  const ctx = {
    sampleRate: 8000,
    currentTime: 0,
    createGain: () => ({ ...node(), gain: param() }),
    createBiquadFilter: () => ({ ...node(), type: '', frequency: param(), Q: param() }),
    createStereoPanner: () => ({ ...node(), pan: param() }),
    createConvolver: () => ({ ...node(), buffer: null }),
    createBuffer: (channels: number, length: number) => {
      const data = Array.from({ length: channels }, () => new Float32Array(length));
      return { getChannelData: (i: number) => data[i] };
    },
    createOscillator: () => {
      const osc = source('osc', { type: '', detune: param() });
      return {
        ...osc,
        frequency: param((x) => {
          if (Number.isNaN(osc.record.freq)) osc.record.freq = x;
        }),
      };
    },
    createBufferSource: () => source('buffer', { buffer: null, loop: false }),
  };
  const c = ctx as unknown as BaseAudioContext;
  return { c, out: c.createGain(), struck };
}

function score(cue: Playable, digits: number) {
  const r = recorder();
  schedule(cue, r.c, r.out, 0, digits);
  return r.struck;
}

const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;
const A3 = 220;
const E4 = 329.63;
const A4 = 440;

describe('the celebration voices', () => {
  /*
   * The whole point of the shared timeline. The screen locks its last reel on
   * `land` and the voice is handed the same number, so the chord has to begin
   * on exactly that instant, however many digits are turning.
   *
   * It looks for the bell's second partial, 2.01 times the strike, and not for
   * A4 itself. The last reel's lock click is also an A4 on `land`, so the first
   * draft of this test passed with the chord moved a beat late: the click was
   * standing in for it. Only a bell has that partial.
   */
  it('strikes the chord on the instant the last reel locks', () => {
    for (const [cue, t] of [
      ['streak', STREAK],
      ['milestone', STREAK],
      ['book', BOOK],
    ] as const) {
      for (let digits = 1; digits <= 3; digits++) {
        const hit = score(cue, digits).some(
          (s) => s.kind === 'osc' && near(s.at, t.land / 1000) && near(s.freq, A4 * 2.01),
        );
        expect(hit, `${cue} with ${digits} digits`).toBe(true);
      }
    }
  });

  /*
   * One click per reel on screen, climbing left to right, which is only
   * possible because `play` is told the digit count. A click where no reel
   * stopped would be a sound with nothing to belong to.
   */
  it('locks once for every reel and never for a reel that is not there', () => {
    const three = score('streak', 3);
    [A3, E4, A4].forEach((freq, i) => {
      const at = reelLand(i, 3, STREAK) / 1000;
      expect(
        three.some((s) => s.kind === 'osc' && near(s.at, at) && near(s.freq, freq)),
        `reel ${i}`,
      ).toBe(true);
    });

    const one = score('streak', 1);
    const early = reelLand(0, 2, STREAK) / 1000;
    expect(one.some((s) => near(s.at, early))).toBe(false);
  });

  /*
   * Holds and voices move together. Anything still sounding after the screen
   * has gone is a bell ringing over the reader's page for no reason they can
   * see.
   */
  it('schedules nothing past the moment the screen lets go', () => {
    for (const [cue, hold] of [
      ['streak', STREAK.hold],
      ['milestone', MILESTONE.hold],
      ['book', BOOK.hold],
    ] as const) {
      const last = Math.max(...score(cue, 3).map((s) => s.until));
      expect(last, cue).toBeLessThanOrEqual(hold / 1000);
    }
  });

  /*
   * And from the other end: a voice that finished in the first half of its
   * hold would leave the rest of the screen in silence, which is the mistake
   * the milestone's tail was once lengthened to fix.
   */
  it('keeps sounding into the last second before the screen leaves', () => {
    for (const [cue, hold] of [
      ['streak', STREAK.hold],
      ['milestone', MILESTONE.hold],
      ['book', BOOK.hold],
    ] as const) {
      const last = Math.max(...score(cue, 1).map((s) => s.until));
      expect(last, cue).toBeGreaterThan(hold / 1000 - 1);
    }
  });

  /*
   * The bed in particular. The rest of the score reaching the last second is
   * not enough, because a crackle or a ringing chord can hide a drone that
   * stopped at two seconds and left everything above it standing on nothing.
   * The low A under each celebration starts with the scrim and lasts to
   * within half a second of the hold.
   */
  it('keeps the low A under the whole of each celebration', () => {
    for (const [cue, hold] of [
      ['streak', STREAK.hold],
      ['milestone', MILESTONE.hold],
      ['book', BOOK.hold],
    ] as const) {
      const bed = score(cue, 1).filter((s) => s.kind === 'osc' && s.at === 0 && near(s.freq, 110));
      expect(bed.length, cue).toBeGreaterThan(0);
      expect(Math.max(...bed.map((s) => s.until)), cue).toBeGreaterThan(hold / 1000 - 0.5);
    }
  });

  /* The milestone is the streak with a name added, note for note. */
  it('plays every note of the streak inside the milestone', () => {
    const milestone = score('milestone', 2).filter((s) => s.kind === 'osc');
    for (const note of score('streak', 2).filter((s) => s.kind === 'osc' && s.until < 2.5)) {
      expect(
        milestone.some((m) => near(m.at, note.at) && near(m.freq, note.freq)),
        `${note.freq} at ${note.at}`,
      ).toBe(true);
    }
  });

  it('treats a cue with no reels the same whatever digit count it is given', () => {
    expect(score('chapter', 3)).toEqual(score('chapter', 1));
  });
});

import { useEffect, useState, type CSSProperties } from 'react';
import { digitsOf, plural } from '../lib/format';
import { reducedMotion } from '../lib/motion';
import { chapterCount } from '../lib/navigate';
import { useStore } from '../state/useStore';
import { Cross } from './Ornament';

/**
 * How long each moment stays up before it lets go of the screen.
 *
 * The `streak` and `book` voices in `sound.ts` are scored against these and the
 * reel timings below. Shortening one leaves bells ringing over a screen that
 * has gone, and lengthening it puts silence on the end, so the numbers move
 * together or not at all.
 */
const HOLD_MS = { streak: 3600, book: 4600 } as const;
/** Under reduced motion there is no roll to wait for, so it leaves sooner. */
const HOLD_CALM_MS = { streak: 2200, book: 2600 } as const;
/** Each reel stops this much after the one to its left, like a slot machine. */
const REEL_STAGGER_MS = 220;
/** When the reels start: after the cross for a streak, after the name for a book. */
const REEL_START_MS = { streak: 420, book: 1500 } as const;

/**
 * The strip has three runs of 0 to 9, and the target sits in the last run, so
 * the reel passes twenty digits on the way rather than nudging one step. That
 * is what makes it a roll and not a flip.
 */
const STRIP = Array.from({ length: 30 }, (_, i) => i % 10);
const RUNS_BEFORE_TARGET = 20;

function Reel({ digit, delay }: { digit: number; delay: number }) {
  return (
    <span className="reel">
      <span
        className="reel__strip"
        style={
          {
            '--reel-end': `${-(RUNS_BEFORE_TARGET + digit)}em`,
            '--reel-delay': `${delay}ms`,
          } as CSSProperties
        }
      >
        {STRIP.map((d, i) => (
          <span key={i} className="reel__digit">
            {d}
          </span>
        ))}
      </span>
    </span>
  );
}

function Reels({ value, kind }: { value: number; kind: keyof typeof REEL_START_MS }) {
  return (
    <div className="celebrate__number" aria-hidden="true">
      {digitsOf(value).map((d, i) => (
        <Reel key={i} digit={d} delay={REEL_START_MS[kind] + i * REEL_STAGGER_MS} />
      ))}
    </div>
  );
}

type Shown =
  | { id: number; kind: 'streak'; current: number; best: number }
  | {
      id: number;
      kind: 'book';
      book: string;
      /** Books finished in the same change beyond the one named. */
      more: number;
      chapters: number;
      done: number;
      total: number;
    };

/**
 * The two moments worth stopping the app for, made into moments.
 *
 * Full screen and in the middle, because a small flicker on the hero was not
 * enough to be noticed. Both fire off the cue channel the sounds use, so the
 * bell and the screen are one event rather than two systems separately
 * noticing the same thing.
 *
 * A streak is a number, so it arrives like a slot machine, each digit on a reel
 * that rolls past twenty others and lands. A book is a name, so the name rises
 * first, and the reels come after with where that leaves the count. The book is
 * the bigger of the two: rings leave the cross, it holds a second longer, and
 * its sound has two arrivals rather than one. Finishing a book is rarer than a
 * day, and the size of the moment should say so.
 *
 * Under `prefers-reduced-motion` there is no roll, no rise and no rings: the
 * cross and the words are simply there, and it leaves sooner.
 *
 * It sits in `Shell` beside the undo bar, never inside anything transformed,
 * because a transformed ancestor becomes the containing block for `fixed` and
 * this would stop covering the screen.
 */
export function StreakCelebration() {
  const { cue, derived } = useStore();
  /** What was true at the moment of the cue, held so a later mark cannot move it. */
  const [shown, setShown] = useState<Shown | null>(null);

  useEffect(() => {
    if (cue?.name === 'streak') {
      setShown({
        id: cue.id,
        kind: 'streak',
        current: derived.streak.current,
        best: derived.streak.longest,
      });
    } else if (cue?.name === 'book' && cue.books && cue.books.length > 0) {
      const book = cue.books[0];
      setShown({
        id: cue.id,
        kind: 'book',
        book,
        more: cue.books.length - 1,
        // From the canon rather than the track: a reader can finish a book their
        // track does not contain by wandering into it from the reader.
        chapters: chapterCount(book),
        done: derived.overall.booksDone,
        total: derived.overall.booksTotal,
      });
    }
    // Read once, when the cue arrives. `derived` changing later must not reopen
    // or renumber a moment that has already been seen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cue]);

  useEffect(() => {
    if (!shown) return;
    const hold = reducedMotion() ? HOLD_CALM_MS[shown.kind] : HOLD_MS[shown.kind];
    const timer = setTimeout(() => setShown(null), hold);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShown(null);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', onKey);
    };
  }, [shown]);

  if (!shown) return null;

  const calm = reducedMotion() ? '' : undefined;

  if (shown.kind === 'streak') {
    const newBest = shown.current > 1 && shown.current >= shown.best;
    return (
      /*
       * Keyed on the cue id so a second moment in the same session replaces the
       * whole thing and every animation runs again from the start. Re-rendering
       * the same elements with new digits would leave the reels where they were.
       */
      <div
        key={shown.id}
        className="celebrate"
        role="status"
        aria-live="polite"
        data-calm={calm}
        onClick={() => setShown(null)}
      >
        <div className="celebrate__inner">
          <Cross size={44} className="celebrate__cross" />
          <Reels value={shown.current} kind="streak" />
          <p className="celebrate__label">{shown.current === 1 ? 'Day one' : 'day streak'}</p>
          <p className="celebrate__sub">
            {newBest ? 'Your best yet' : `Best so far ${shown.best}`}
          </p>
          {/* The reels are decoration to a screen reader; this is the sentence. */}
          <span className="sr-only">
            {shown.current === 1 ? 'Your streak starts today.' : `${shown.current} day streak.`}
          </span>
        </div>
      </div>
    );
  }

  const others = shown.more > 0 ? `, and ${plural(shown.more, 'other book')}` : '';
  return (
    <div
      key={shown.id}
      className="celebrate celebrate--book"
      role="status"
      aria-live="polite"
      data-calm={calm}
      onClick={() => setShown(null)}
    >
      <div className="celebrate__inner">
        {/* Rings leave the cross the way the mastheads carry theirs, and they
            are what says this one is bigger than a streak. */}
        <span className="celebrate__mark">
          <span className="celebrate__rings" aria-hidden="true">
            <i style={{ '--r': 0 } as CSSProperties} />
            <i style={{ '--r': 1 } as CSSProperties} />
            <i style={{ '--r': 2 } as CSSProperties} />
          </span>
          <Cross size={56} className="celebrate__cross" />
        </span>

        <p className="celebrate__eyebrow">Finished</p>

        {/* The name rises through a clip, a title card rather than a fade. */}
        <span className="celebrate__nameClip">
          <span className="celebrate__name">{shown.book}</span>
        </span>

        <Reels value={shown.done} kind="book" />
        <p className="celebrate__label">of {plural(shown.total, 'book')}</p>

        <p className="celebrate__sub">
          {plural(shown.chapters, 'chapter')}
          {others}
        </p>

        <span className="sr-only">
          {`${shown.book} finished${others}. ${shown.done} of ${shown.total} books read.`}
        </span>
      </div>
    </div>
  );
}

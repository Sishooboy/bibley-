import { useEffect, useState, type CSSProperties } from 'react';
import { digitsOf } from '../lib/format';
import { reducedMotion } from '../lib/motion';
import { useStore } from '../state/useStore';
import { Cross } from './Ornament';

/**
 * How long the whole moment stays up before it lets go of the screen.
 *
 * The `streak` voice in `sound.ts` is scored against this and the reel timings
 * below, and runs about 3.4 seconds. Shortening this leaves the bells ringing
 * over a screen that has gone, and lengthening it puts silence on the end, so
 * the two numbers move together or not at all.
 */
const HOLD_MS = 3600;
/** Under reduced motion there is no roll to wait for, so it leaves sooner. */
const HOLD_CALM_MS = 2200;
/** Each reel stops this much after the one to its left, like a slot machine. */
const REEL_STAGGER_MS = 220;
/** The reels start once the cross has landed. */
const REEL_START_MS = 420;

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

/**
 * The streak growing, made into a moment.
 *
 * Full screen and in the middle, because the small flicker on the hero was not
 * enough to be noticed. It shows the moment the streak cue fires, which is the
 * same cue the sound uses: the bell and this are one event.
 *
 * The number arrives like a slot machine, each digit on a reel that rolls past
 * twenty others and lands, the right reel a beat after the left. Under
 * `prefers-reduced-motion` there is no roll and no bounce: the cross and the
 * number are simply there, and it leaves sooner.
 *
 * It sits in `Shell` beside the undo bar, never inside anything transformed,
 * because a transformed ancestor becomes the containing block for `fixed` and
 * this would stop covering the screen.
 */
export function StreakCelebration() {
  const { cue, derived } = useStore();
  /** The streak at the moment of the cue, held so a later mark cannot move it. */
  const [shown, setShown] = useState<{ id: number; current: number; best: number } | null>(
    null,
  );

  useEffect(() => {
    if (cue?.name !== 'streak') return;
    setShown({ id: cue.id, current: derived.streak.current, best: derived.streak.longest });
    // Read the streak once, when the cue arrives. `derived` changing later must
    // not reopen or renumber a moment that has already been seen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cue]);

  useEffect(() => {
    if (!shown) return;
    const timer = setTimeout(() => setShown(null), reducedMotion() ? HOLD_CALM_MS : HOLD_MS);
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

  const digits = digitsOf(shown.current);
  const newBest = shown.current > 1 && shown.current >= shown.best;

  return (
    /*
     * Keyed on the cue id so a second streak in the same session replaces the
     * whole thing and every animation runs again from the start. Re-rendering
     * the same elements with new digits would leave the reels where they were.
     */
    <div
      key={shown.id}
      className="celebrate"
      role="status"
      aria-live="polite"
      data-calm={reducedMotion() ? '' : undefined}
      onClick={() => setShown(null)}
    >
      <div className="celebrate__inner">
        <Cross size={44} className="celebrate__cross" />

        <div className="celebrate__number" aria-hidden="true">
          {digits.map((d, i) => (
            <Reel key={i} digit={d} delay={REEL_START_MS + i * REEL_STAGGER_MS} />
          ))}
        </div>

        <p className="celebrate__label">
          {shown.current === 1 ? 'Day one' : 'day streak'}
        </p>

        <p className="celebrate__sub">
          {newBest ? 'Your best yet' : `Best so far ${shown.best}`}
        </p>

        {/* The reels are decoration to a screen reader; this is the sentence. */}
        <span className="sr-only">
          {shown.current === 1
            ? 'Your streak starts today.'
            : `${shown.current} day streak.`}
        </span>
      </div>
    </div>
  );
}

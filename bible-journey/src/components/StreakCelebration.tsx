import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from 'react';
import { CANON } from '../data/canon';
import type { BibleNumber } from '../data/numbers';
import {
  BOOK,
  FADE_OUT_MS,
  MILESTONE,
  STREAK,
  exitFor,
  holdFor,
  reelStart,
  type CelebrationKind,
  type ReelTiming,
} from '../lib/celebration';
import { fromDayKey, type DayKey } from '../lib/dates';
import { digitsOf, plural } from '../lib/format';
import { reducedMotion } from '../lib/motion';
import { chapterCount } from '../lib/navigate';
import { milestoneFor, refLabel } from '../lib/numbers';
import { last30Days } from '../lib/progress';
import { useStore } from '../state/useStore';
import { CelebrationParticles } from './CelebrationParticles';
import { Cross } from './Ornament';

/**
 * The strip has three runs of 0 to 9, and the target sits in the last run, so
 * the reel passes twenty digits on the way rather than nudging one step. That
 * is what makes it a roll and not a flip.
 */
const STRIP = Array.from({ length: 30 }, (_, i) => i % 10);
const RUNS_BEFORE_TARGET = 20;

const LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** Twelve rays off the cross, one every thirty degrees. */
const RAYS = Array.from({ length: 12 }, (_, i) => i);

function Reel({ digit, delay }: { digit: number; delay: number }) {
  return (
    <span
      className="reel"
      style={
        {
          '--reel-end': `${-(RUNS_BEFORE_TARGET + digit)}em`,
          '--reel-delay': `${delay}ms`,
        } as CSSProperties
      }
    >
      <span className="reel__strip">
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
 * The count, on reels, with the light it lands in.
 *
 * The bloom and the halo sit behind the digits and fire on `--t-land`, which is
 * the moment the last reel locks whatever the number of digits, because the
 * reels are counted back from it.
 */
function Count({
  value,
  timing,
  anchor,
}: {
  value: number;
  timing: ReelTiming;
  anchor?: RefObject<HTMLDivElement | null>;
}) {
  const digits = digitsOf(value);
  return (
    <div className="celebrate__count" ref={anchor} aria-hidden="true">
      <span className="celebrate__bloom" />
      <span className="celebrate__halo" />
      <span className="celebrate__number">
        {digits.map((d, i) => (
          <Reel key={i} digit={d} delay={reelStart(i, digits.length, timing)} />
        ))}
      </span>
    </div>
  );
}

/**
 * The flame, in three layers that each flicker on their own clock.
 *
 * Red outside, gold through the middle, and a core near white, which is how a
 * flame is actually coloured and is also the app's two colours and its paper.
 * Three periods that share no common factor, so the layers never fall into step
 * and the fire never visibly loops.
 */
function Flame({ anchor }: { anchor: RefObject<HTMLSpanElement | null> }) {
  // Gradient ids have to be unique in the document, and React's own ids carry
  // characters a url() reference is not obliged to accept.
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  return (
    <span className="celebrate__flame" ref={anchor} aria-hidden="true">
      <span className="celebrate__flameGlow" />
      <span className="celebrate__spark" />
      <span className="celebrate__flameBody">
        <svg viewBox="0 0 100 140" width="84" height="118" focusable="false">
          <defs>
            <linearGradient id={`${id}o`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#c81d25" />
              <stop offset="0.5" stopColor="#e2471f" />
              <stop offset="1" stopColor="#f59a1b" />
            </linearGradient>
            <linearGradient id={`${id}m`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#f7b801" />
              <stop offset="1" stopColor="#ffd866" />
            </linearGradient>
            <linearGradient id={`${id}c`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#fff1bd" />
              <stop offset="1" stopColor="#fffdf6" />
            </linearGradient>
          </defs>
          <path
            className="celebrate__flameOuter"
            fill={`url(#${id}o)`}
            d="M50 3C56 22 70 34 80 52C90 70 92 88 88 104C83 124 68 137 50 137C32 137 16 125 12 106C8 88 13 72 22 60C24 72 28 78 34 81C30 62 33 44 40 32C43 26 47 16 50 3Z"
          />
          <path
            className="celebrate__flameMid"
            fill={`url(#${id}m)`}
            d="M52 38C58 54 72 64 74 86C76 108 66 128 50 128C35 128 25 116 26 98C27 86 33 78 38 72C39 82 42 88 46 90C44 72 46 54 52 38Z"
          />
          <path
            className="celebrate__flameCore"
            fill={`url(#${id}c)`}
            d="M51 80C56 92 63 100 62 112C61 122 57 127 50 127C43 127 39 122 39 113C39 103 46 94 51 80Z"
          />
        </svg>
      </span>
    </span>
  );
}

type Day = { day: DayKey; chapters: number };

/**
 * The seven days the run belongs to, lighting up one after another, and the
 * newest day of the run catching last. The same seven the hero shows, so what
 * is celebrated here is what the journey screen says a second later.
 */
function Week({ week, head }: { week: Day[]; head: DayKey | null }) {
  return (
    <div className="celebrate__week" aria-hidden="true">
      {week.map((d, i) => (
        <span
          key={d.day}
          className="celebrate__day"
          data-read={d.chapters > 0 ? '' : undefined}
          data-head={d.day === head && d.chapters > 0 ? '' : undefined}
          style={{ '--i': i } as CSSProperties}
        >
          {LETTERS[fromDayKey(d.day).getDay()]}
        </span>
      ))}
    </div>
  );
}

type ShelfBook = { name: string; part: number; fresh: boolean };

/**
 * Every book in the plan as one square, in printed order, the way `BookGrid`
 * draws them on the journey. The one just finished waits as an empty outline
 * and fills at the instant the count lands, so the number and the picture are
 * one event.
 */
function Shelf({
  books,
  freshRef,
}: {
  books: ShelfBook[];
  freshRef: RefObject<HTMLSpanElement | null>;
}) {
  const cols = Math.ceil(Math.sqrt(books.length * 2.2));
  let first = true;
  return (
    <div
      className="celebrate__shelf"
      style={{ '--cols': cols } as CSSProperties}
      aria-hidden="true"
    >
      {books.map((b, i) => {
        // The wave runs down the diagonals, top left to bottom right.
        const wave = (i % cols) + Math.floor(i / cols);
        const anchor = b.fresh && first;
        if (anchor) first = false;
        return (
          <span
            key={b.name}
            ref={anchor ? freshRef : undefined}
            className="celebrate__shelfBook"
            data-fresh={b.fresh ? '' : undefined}
            data-done={!b.fresh && b.part >= 1 ? '' : undefined}
            style={{ '--w': wave, '--part': b.part } as CSSProperties}
          />
        );
      })}
    </div>
  );
}

type Shown =
  | {
      id: number;
      kind: 'streak';
      current: number;
      best: number;
      /*
       * Set when the run has landed on a number scripture keeps. It rides on
       * the streak variant rather than being a third kind, because it is the
       * same moment: the same flame, the same reels, with a name and three
       * places to look underneath.
       */
      milestone?: BibleNumber;
      week: Day[];
      /** The newest day of the run, which is the cell that catches last. */
      head: DayKey | null;
    }
  | {
      id: number;
      kind: 'book';
      book: string;
      /** Books finished in the same change beyond the one named. */
      more: number;
      chapters: number;
      done: number;
      total: number;
      /** Null when the book is not in the plan, so there is no square to light. */
      shelf: ShelfBook[] | null;
    };

/** Every timing as a custom property, so the stylesheet holds no numbers of its own. */
function timeline(kind: CelebrationKind, calm: boolean): CSSProperties {
  const t: Record<string, number> =
    kind === 'book' ? { ...BOOK } : kind === 'milestone' ? { ...STREAK, ...MILESTONE } : { ...STREAK };
  const vars: Record<string, string> = {};
  for (const [name, ms] of Object.entries(t)) vars[`--t-${name}`] = `${ms}ms`;
  vars['--t-exit'] = `${exitFor(kind, calm)}ms`;
  vars['--t-fade'] = `${FADE_OUT_MS}ms`;
  return vars as CSSProperties;
}

/**
 * The two moments worth stopping the app for, made into moments.
 *
 * Full screen and in the middle, because a small flicker on the hero was not
 * enough to be noticed. Both fire off the cue channel the sounds use, so the
 * bell and the screen are one event rather than two systems separately
 * noticing the same thing. **Every timing comes from `celebration.ts`**, which
 * the sounds read too, so the chord lands on the frame the last reel locks
 * because both were told the same number.
 *
 * A streak is fire. A match is struck, the flame catches, embers rise off it,
 * and the number rolls in underneath on reels that blur as they turn. When the
 * last one locks the flame flares, sparks burst, light blooms behind the count
 * and the week it belongs to lights up a day at a time.
 *
 * A book is gold. The pages riffle shut in the sound, the cross comes down
 * through slowly turning light and lands with rings and rays leaving it, the
 * name rises with a rule drawn under it, gold leaf starts to fall, and the
 * whole plan arrives as a shelf of squares. The one just finished fills at the
 * instant the count lands. Finishing a book is rarer than a day, and the size
 * of the moment says so: it holds longer and it has two arrivals, not one.
 *
 * **Reduced motion keeps the moment and drops the movement.** No canvas is
 * mounted at all, nothing rolls, flickers, rises or falls, and the lights that
 * only ever flash (rays, rings, bloom, halo, spark) are not drawn. The scrim
 * still fades, since a full screen snapping into existence is a bigger jolt
 * than the fade it would be avoiding.
 *
 * It sits in `Shell` beside the undo bar, never inside anything transformed,
 * because a transformed ancestor becomes the containing block for `fixed` and
 * this would stop covering the screen.
 */
export function StreakCelebration() {
  const { cue, derived, data } = useStore();
  /** What was true at the moment of the cue, held so a later mark cannot move it. */
  const [shown, setShown] = useState<Shown | null>(null);
  const flameRef = useRef<HTMLSpanElement>(null);
  const freshRef = useRef<HTMLSpanElement>(null);
  const countRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const markRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (cue?.name === 'streak') {
      setShown({
        id: cue.id,
        kind: 'streak',
        current: derived.streak.current,
        best: derived.streak.longest,
        milestone: milestoneFor(derived.streak.current) ?? undefined,
        week: last30Days(data.read, 7),
        head: derived.streak.lastReadDay,
      });
    } else if (cue?.name === 'book' && cue.books && cue.books.length > 0) {
      const book = cue.books[0];
      const finished = new Set(cue.books);
      const byName = new Map<string, { chapters: number; read: number }>();
      for (const phase of derived.phases) for (const b of phase.books) byName.set(b.name, b);
      const shelf = CANON.filter((name) => byName.has(name)).map((name) => {
        const b = byName.get(name)!;
        return {
          name,
          part: b.chapters === 0 ? 0 : Math.min(1, b.read / b.chapters),
          fresh: finished.has(name),
        };
      });
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
        // A book outside the plan has no square, so there is nothing to light.
        shelf: shelf.some((b) => b.fresh) ? shelf : null,
      });
    }
    // Read once, when the cue arrives. `derived` changing later must not reopen
    // or renumber a moment that has already been seen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cue]);

  const kind: CelebrationKind | null = !shown
    ? null
    : shown.kind === 'streak' && shown.milestone
      ? 'milestone'
      : shown.kind;

  /*
   * Where the flame or the cross ended up, handed to the stylesheet so the
   * warmth and the rays are centred on it. Measured before paint, so the light
   * never starts in one place and jumps to another. A scale animation does not
   * move an element's centre, so the descent and the catch cannot throw it off.
   */
  useLayoutEffect(() => {
    const root = rootRef.current;
    const mark = (shown?.kind === 'book' ? markRef : flameRef).current;
    if (!root || !mark) return;
    const r = mark.getBoundingClientRect();
    root.style.setProperty('--mark-x', `${r.left + r.width / 2}px`);
    root.style.setProperty('--mark-y', `${r.top + r.height / 2}px`);
  }, [shown]);

  useEffect(() => {
    if (!kind) return;
    const timer = setTimeout(() => setShown(null), holdFor(kind, reducedMotion()));
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShown(null);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', onKey);
    };
  }, [shown, kind]);

  if (!shown || !kind) return null;

  const still = reducedMotion();
  const calm = still ? '' : undefined;
  const hold = holdFor(kind, still);

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
        ref={rootRef}
        className={`celebrate celebrate--streak${shown.milestone ? ' celebrate--milestone' : ''}`}
        style={timeline(kind, still)}
        role="status"
        aria-live="polite"
        data-calm={calm}
        onClick={() => setShown(null)}
      >
        <span className="celebrate__warmth" aria-hidden="true" />
        {!still && (
          <CelebrationParticles
            mode="embers"
            origin={flameRef}
            from={STREAK.ignite + 140}
            burstAt={STREAK.land}
            until={hold - 700}
          />
        )}
        <div className="celebrate__inner">
          <Flame anchor={flameRef} />
          <Count value={shown.current} timing={STREAK} />
          <p className="celebrate__label">{shown.current === 1 ? 'Day one' : 'day streak'}</p>
          <Week week={shown.week} head={shown.head} />
          <p className={`celebrate__sub${newBest ? ' celebrate__sub--best' : ''}`}>
            {newBest ? 'Your best yet' : `Best so far ${shown.best}`}
          </p>

          {/*
            Deliberately short. It names the number, says in one line what the
            verses below it have in common, and then gets out of the way: this
            is a moment on the way into a chapter, not a page about numerology.
            The references are the substance, and the reader can go and look.
          */}
          {shown.milestone && (
            <div className="milestone">
              <span className="milestone__rule" />
              <span className="milestone__clip">
                <span className="milestone__name">{shown.milestone.name}</span>
              </span>
              <p className="milestone__line">{shown.milestone.line}</p>
              <p className="milestone__refs">
                {shown.milestone.refs.map((ref) => refLabel(ref)).join('  ·  ')}
              </p>
            </div>
          )}

          {/* The reels are decoration to a screen reader; this is the sentence. */}
          <span className="sr-only">
            {shown.current === 1 ? 'Your streak starts today.' : `${shown.current} day streak.`}
            {shown.milestone &&
              ` ${shown.milestone.name}. ${shown.milestone.line} ${shown.milestone.refs
                .map((ref) => refLabel(ref))
                .join(', ')}.`}
          </span>
        </div>
      </div>
    );
  }

  const others = shown.more > 0 ? `, and ${plural(shown.more, 'other book')}` : '';
  return (
    <div
      key={shown.id}
      ref={rootRef}
      className="celebrate celebrate--book"
      style={timeline(kind, still)}
      role="status"
      aria-live="polite"
      data-calm={calm}
      onClick={() => setShown(null)}
    >
      <span className="celebrate__rays" aria-hidden="true" />
      {!still && (
        <CelebrationParticles
          mode="leaf"
          origin={shown.shelf ? freshRef : countRef}
          from={BOOK.name}
          burstAt={BOOK.land}
          until={hold}
        />
      )}
      <div className="celebrate__inner">
        <span className="celebrate__mark" ref={markRef} aria-hidden="true">
          <span className="celebrate__rings">
            <i style={{ '--r': 0 } as CSSProperties} />
            <i style={{ '--r': 1 } as CSSProperties} />
            <i style={{ '--r': 2 } as CSSProperties} />
          </span>
          <span className="celebrate__burst">
            {RAYS.map((a) => (
              <i key={a} style={{ '--a': a } as CSSProperties} />
            ))}
          </span>
          <Cross size={56} className="celebrate__cross" />
        </span>

        <p className="celebrate__eyebrow">Finished</p>

        {/* The name rises through a clip, a title card rather than a fade. */}
        <span className="celebrate__nameClip">
          <span className="celebrate__name">{shown.book}</span>
        </span>
        <span className="celebrate__rule" aria-hidden="true" />

        <Count value={shown.done} timing={BOOK} anchor={countRef} />
        <p className="celebrate__label">of {plural(shown.total, 'book')}</p>
        {shown.shelf && <Shelf books={shown.shelf} freshRef={freshRef} />}

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

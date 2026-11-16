/*
 * What a streams track asks for on a given day.
 *
 * Daily Mix reads four streams side by side: three chapters of the Old
 * Testament, one of the New, a psalm and a proverb. They are two different
 * kinds of stream, and the difference is the whole design.
 *
 * **An order waits for you.** The Old and New Testament streams walk an order,
 * and a day's part is the next few chapters not yet read. Miss a day and the
 * same chapters are waiting tomorrow, so the reader is late rather than having
 * skipped anything, which is the only honest answer for a plan whose point is
 * reading every chapter. The day's part is cut from what was read *before*
 * today, so it holds still while it is being read: marking Genesis 21 does not
 * slide Genesis 24 into view, it ticks Genesis 21 off.
 *
 * **A cursor keeps the calendar.** The psalm and the proverb are companions to
 * the day rather than progress through anything, so they move with the date
 * whatever was read. The proverb is the day of the month, which is what
 * Proverbs' thirty-one chapters have always been read against. The psalm walks
 * from Psalm 1 a day at a time from the day the journal began, which is synced
 * and merges to the earliest, so a phone and a laptop agree on today's psalm.
 * Either one counts as read if it has ever been read: this app records which
 * chapters a reader has read, not how many times, and marking it again would
 * move the day it was first read, which can shorten a streak already earned.
 */
import type { ResolvedStream, StreamTrack } from '../data/tracks';
import { daysBetween, fromDayKey, type DayKey } from './dates';
import { chapterKey, type ReadMap } from './storage';

export type Ref = { book: string; chapter: number };

export type MixReading = {
  stream: ResolvedStream;
  /** Today's chapters for this stream. Empty only when an order has run out. */
  refs: Ref[];
  /** The ones still to read, in order. */
  unread: Ref[];
  done: boolean;
};

/** `count` chapters from `start`, wrapping round the end of the sequence. */
function wrapped(sequence: Ref[], start: number, count: number): Ref[] {
  const len = sequence.length;
  return Array.from({ length: Math.min(count, len) }, (_, i) => sequence[(start + i) % len]);
}

/** Today's chapters for one stream, before asking which are read. */
export function streamRefs(
  stream: ResolvedStream,
  read: ReadMap,
  day: DayKey,
  startedAt: DayKey,
): Ref[] {
  const daily = Math.max(1, stream.daily_chapters);

  if (stream.order_ref) {
    const out: Ref[] = [];
    for (const ref of stream.sequence) {
      const when = read[chapterKey(ref.book, ref.chapter)];
      // Read on an earlier day: not part of today. Read today, or not at all:
      // today's, so the part keeps its shape while it is being read. `null` is a
      // chapter read before the journal began, the earliest day there is.
      if (when === null || (when !== undefined && when < day)) continue;
      out.push(ref);
      if (out.length === daily) break;
    }
    return out;
  }

  if (stream.loops_at) {
    // One a day of the month: Proverbs 1 on the first, 31 on the thirty-first.
    const dayOfMonth = fromDayKey(day).getDate();
    return wrapped(stream.sequence, ((dayOfMonth - 1) % stream.loops_at) * daily, daily);
  }

  // A step a day through one book from the day the journal began, round again
  // at the end. A start date in the future, from a clock that was wrong, reads
  // as day one rather than as a negative index.
  const step = Math.max(0, daysBetween(startedAt, day));
  return wrapped(stream.sequence, step * daily, daily);
}

/** Every stream's part of the day, in the order the track lists them. */
export function todaysMix(
  track: StreamTrack,
  read: ReadMap,
  day: DayKey,
  startedAt: DayKey,
): MixReading[] {
  return track.streams.map((stream) => {
    const refs = streamRefs(stream, read, day, startedAt);
    const unread = refs.filter((ref) => !(chapterKey(ref.book, ref.chapter) in read));
    return { stream, refs, unread, done: unread.length === 0 };
  });
}

/**
 * True once every order the track counts has run out. The cursors never do, so
 * they are not asked: a proverb of the day is still there after the Bible is read.
 */
export function mixFinished(mix: MixReading[]): boolean {
  return mix.every((m) => !m.stream.counts_toward_completion || m.refs.length === 0);
}

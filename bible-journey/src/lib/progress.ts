import type { ChapterRef, PhasedTrack } from '../data/tracks';
import { addDays, daysBetween, today, type DayKey } from './dates';
import { chapterKey, type ReadMap } from './storage';

export type BookProgress = {
  name: string;
  chapters: number;
  read: number;
  done: boolean;
  started: boolean;
};

export type PhaseProgress = {
  phase: number;
  title: string;
  chapters: number;
  read: number;
  done: boolean;
  started: boolean;
  books: BookProgress[];
};

export type PhaseStatus = 'done' | 'current' | 'ahead' | 'upcoming';

export function isRead(read: ReadMap, book: string, chapter: number): boolean {
  return chapterKey(book, chapter) in read;
}

export function bookProgress(read: ReadMap, name: string, chapters: number): BookProgress {
  let n = 0;
  for (let c = 1; c <= chapters; c++) if (isRead(read, name, c)) n++;
  return { name, chapters, read: n, done: n === chapters, started: n > 0 };
}

export function phaseProgressAll(read: ReadMap, plan: PhasedTrack): PhaseProgress[] {
  return plan.phases.map((p) => {
    const books = p.books.map((b) => bookProgress(read, b.name, b.chapters));
    const chapters = books.reduce((n, b) => n + b.chapters, 0);
    const readCount = books.reduce((n, b) => n + b.read, 0);
    return {
      phase: p.phase,
      title: p.title,
      chapters,
      read: readCount,
      done: readCount === chapters,
      started: readCount > 0,
      books,
    };
  });
}

/**
 * The "current" phase is the first unfinished one in plan order. Later phases
 * you've already dipped into are 'ahead' rather than 'upcoming'. Nothing is
 * ever locked, the labels just say where the plan's edge is.
 */
export function phaseStatuses(phases: PhaseProgress[]): Map<number, PhaseStatus> {
  const current = phases.find((p) => !p.done)?.phase;
  return new Map(
    phases.map((p) => {
      if (p.done) return [p.phase, 'done' as PhaseStatus];
      if (p.phase === current) return [p.phase, 'current' as PhaseStatus];
      return [p.phase, p.started ? 'ahead' : 'upcoming'];
    }),
  );
}

export type OverallProgress = {
  /** Chapters read across every phase of the active plan. */
  planRead: number;
  planTotal: number;
  booksDone: number;
  booksTotal: number;
  percent: number;
};

export function overallProgress(phases: PhaseProgress[], plan: PhasedTrack): OverallProgress {
  const planRead = phases.reduce((n, p) => n + p.read, 0);
  const booksDone = phases.reduce((n, p) => n + p.books.filter((b) => b.done).length, 0);
  return {
    planRead,
    planTotal: plan.chapterCount,
    booksDone,
    booksTotal: plan.bookCount,
    percent: plan.chapterCount === 0 ? 0 : (planRead / plan.chapterCount) * 100,
  };
}

/** Next unread chapters in plan order, starting from wherever you left off. */
export function nextUnread(read: ReadMap, count: number, plan: PhasedTrack): ChapterRef[] {
  /*
   * Nothing asked for is nothing returned. Without this the loop below never
   * satisfies `out.length === count`, so it runs to the end of the track and a
   * request for no chapters marks the entire Bible, which is the worst available
   * reading of it. Only ever called with 1, 3, 5 or 10 today, but a computed
   * amount that lands on zero would be silent and catastrophic.
   */
  if (count <= 0) return [];
  const out: ChapterRef[] = [];
  for (const ref of plan.sequence) {
    if (isRead(read, ref.book, ref.chapter)) continue;
    out.push(ref);
    if (out.length === count) break;
  }
  return out;
}

/** Chapters read per day, journal entries only (John's seeded chapters excluded). */
export function readsByDay(read: ReadMap): Map<DayKey, number> {
  const byDay = new Map<DayKey, number>();
  for (const value of Object.values(read)) {
    if (!value) continue;
    byDay.set(value, (byDay.get(value) ?? 0) + 1);
  }
  return byDay;
}

/**
 * Days of unbroken reading earned before a rest day is, and the most that can
 * be held at once.
 *
 * A streak that cannot be lost is a counter, and a streak that dies to one bad
 * day is a punishment. Rest days are what put something at stake without making
 * the stake cruel: they have to be earned by reading, they run out, and holding
 * more than two would mean a fortnight away costs nothing.
 */
export const REST_EVERY = 7;
export const REST_CAP = 2;

export type Streak = {
  current: number;
  longest: number;
  lastReadDay: DayKey | null;
  /** Rest days in hand right now, earned by the current run. */
  rest: number;
  /** True when a missed day is being covered by a rest day at this moment. */
  resting: boolean;
  /**
   * The run that ended on `lastReadDay`, whether or not it is still alive.
   * `current` is this or zero; this is what a broken streak *was*, which is the
   * only way to say what was lost.
   */
  lastRun: number;
};

/**
 * The streak, and what is holding it up.
 *
 * **Rest days are derived, never stored.** A balance on the journal would need
 * a `normalize()` whitelist entry, would have to survive a merge, and two
 * devices could disagree about how many were left. Walking the days each time
 * costs nothing on a journal this size and cannot desync, because the days are
 * the only source of truth there is.
 *
 * A run counts days actually read. A rest day preserves a run across a missed
 * day without adding to it, so "12 day streak" always means twelve days of
 * reading and never eleven days and an excuse.
 */
export function streak(read: ReadMap): Streak {
  const days = [...readsByDay(read).keys()].sort();
  if (days.length === 0) {
    return { current: 0, longest: 0, lastReadDay: null, rest: 0, resting: false, lastRun: 0 };
  }

  let longest = 1;
  let run = 1;
  let spent = 0;
  /** Earned by the run so far, minus what covering missed days has cost. */
  const inHand = () => Math.min(REST_CAP, Math.floor(run / REST_EVERY) - spent);

  for (let i = 1; i < days.length; i++) {
    const missed = daysBetween(days[i - 1], days[i]) - 1;
    if (missed === 0) {
      run += 1;
    } else if (missed <= inHand()) {
      // Each missed day costs one, so a two day absence needs two in hand.
      spent += missed;
      run += 1;
    } else {
      // Out of cover. The run ends and its unspent rest days end with it.
      run = 1;
      spent = 0;
    }
    if (run > longest) longest = run;
  }

  const last = days[days.length - 1];
  /*
   * Today is not over, so it is never counted as missed: `gap` of 1 means read
   * yesterday and nothing yet today, which has always stood on its own. Beyond
   * that, every whole day since costs a rest day like any other.
   */
  const missedSince = Math.max(0, daysBetween(last, today()) - 1);
  const covered = missedSince <= inHand();
  const current = covered ? run : 0;

  return {
    current,
    longest,
    lastReadDay: last,
    rest: current === 0 ? 0 : Math.max(0, inHand() - missedSince),
    resting: current > 0 && missedSince > 0,
    lastRun: run,
  };
}

export type RiskLevel = 'calm' | 'due' | 'urgent';
export type Risk = { level: RiskLevel; text: string };

/** After this hour, a day that has not been read is a day nearly gone. */
const LATE_HOUR = 20;

/**
 * What to say about a streak that has not been fed today, or null when there is
 * nothing to say.
 *
 * The old line said the same thing at eight in the morning as at midnight, and
 * a warning that never changes is a warning nobody reads. This escalates with
 * the clock and, more importantly, **tells the truth about the consequence**:
 * with a rest day in hand the streak does not end tonight, it costs something,
 * and saying "ends tonight" then would be a lie the app gets caught in.
 */
export function streakRisk(s: Streak, readToday: boolean, now: Date): Risk | null {
  if (readToday || s.current === 0) return null;
  const late = now.getHours() >= LATE_HOUR;
  const days = `${s.current} day streak`;

  if (s.rest > 0) {
    return late
      ? { level: 'due', text: `Miss today and a rest day covers your ${days}.` }
      : { level: 'calm', text: `Your ${days} is waiting on today.` };
  }
  return late
    ? { level: 'urgent', text: `Your ${days} ends tonight.` }
    : { level: 'calm', text: `Your ${days} is waiting on today.` };
}

export type Pace = {
  /** Chapters per week over the active journal window. */
  perWeek: number;
  daysActive: number;
  chaptersLogged: number;
  /** Projected finish date for the remaining plan chapters, or null if no pace yet. */
  finishBy: DayKey | null;
  remaining: number;
};

export function pace(read: ReadMap, planRead: number, plan: PhasedTrack): Pace {
  const byDay = readsByDay(read);
  const days = [...byDay.keys()].sort();
  const chaptersLogged = [...byDay.values()].reduce((a, b) => a + b, 0);
  const remaining = plan.chapterCount - planRead;

  if (days.length === 0) {
    return { perWeek: 0, daysActive: 0, chaptersLogged: 0, finishBy: null, remaining };
  }

  // Span from the first logged day through today, minimum one week so a strong
  // first day doesn't project an absurd finish date.
  const span = Math.max(daysBetween(days[0], today()) + 1, 7);
  const perWeek = (chaptersLogged / span) * 7;
  const finishBy =
    remaining > 0 && perWeek > 0 ? addDays(today(), Math.ceil((remaining / perWeek) * 7)) : null;

  return { perWeek, daysActive: days.length, chaptersLogged, finishBy, remaining };
}

/** Daily counts for the last `n` days, oldest first, gaps filled with zeroes. */
export function last30Days(read: ReadMap, n = 30): { day: DayKey; chapters: number }[] {
  const byDay = readsByDay(read);
  const start = addDays(today(), -(n - 1));
  return Array.from({ length: n }, (_, i) => {
    const day = addDays(start, i);
    return { day, chapters: byDay.get(day) ?? 0 };
  });
}

/** Cumulative plan chapters read across the same window. */
export function cumulative(read: ReadMap, n = 30): { day: DayKey; total: number }[] {
  const byDay = readsByDay(read);
  const start = addDays(today(), -(n - 1));
  let before = 0;
  for (const [day, count] of byDay) if (daysBetween(day, start) > 0) before += count;

  let running = before;
  return Array.from({ length: n }, (_, i) => {
    const day = addDays(start, i);
    running += byDay.get(day) ?? 0;
    return { day, total: running };
  });
}

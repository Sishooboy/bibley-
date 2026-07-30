import {
  CHAPTER_SEQUENCE,
  PHASES,
  PLAN_BOOKS,
  PLAN_CHAPTER_COUNT,
  PROLOGUE,
  TOTAL_CHAPTER_COUNT,
  type ChapterRef,
} from '../data/plan';
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

export function phaseProgressAll(read: ReadMap): PhaseProgress[] {
  return PHASES.map((p) => {
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
  /** Chapters read in the 12-phase plan (excludes the John prologue). */
  planRead: number;
  planTotal: number;
  /** Including John. */
  totalRead: number;
  total: number;
  booksDone: number;
  booksTotal: number;
  percent: number;
};

export function overallProgress(read: ReadMap, phases: PhaseProgress[]): OverallProgress {
  const planRead = phases.reduce((n, p) => n + p.read, 0);
  const booksDone = phases.reduce((n, p) => n + p.books.filter((b) => b.done).length, 0);
  const totalRead = planRead + bookProgress(read, PROLOGUE.name, PROLOGUE.chapters).read;
  return {
    planRead,
    planTotal: PLAN_CHAPTER_COUNT,
    totalRead,
    total: TOTAL_CHAPTER_COUNT,
    booksDone,
    booksTotal: PLAN_BOOKS.length,
    percent: (planRead / PLAN_CHAPTER_COUNT) * 100,
  };
}

/** Next unread chapters in plan order, starting from wherever you left off. */
export function nextUnread(read: ReadMap, count: number): ChapterRef[] {
  const out: ChapterRef[] = [];
  for (const ref of CHAPTER_SEQUENCE) {
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

export type Streak = { current: number; longest: number; lastReadDay: DayKey | null };

export function streak(read: ReadMap): Streak {
  const days = [...readsByDay(read).keys()].sort();
  if (days.length === 0) return { current: 0, longest: 0, lastReadDay: null };

  let longest = 1;
  let run = 1;
  for (let i = 1; i < days.length; i++) {
    run = daysBetween(days[i - 1], days[i]) === 1 ? run + 1 : 1;
    if (run > longest) longest = run;
  }

  const last = days[days.length - 1];
  const gap = daysBetween(last, today());
  // A streak survives "nothing read yet today" but dies after a full missed day.
  const current = gap <= 1 ? run : 0;

  return { current, longest, lastReadDay: last };
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

export function pace(read: ReadMap, planRead: number): Pace {
  const byDay = readsByDay(read);
  const days = [...byDay.keys()].sort();
  const chaptersLogged = [...byDay.values()].reduce((a, b) => a + b, 0);
  const remaining = PLAN_CHAPTER_COUNT - planRead;

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

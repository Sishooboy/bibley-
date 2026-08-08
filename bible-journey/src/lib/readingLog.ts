import type { DayKey } from './dates';
import type { ReadMap } from './storage';

/** Chapters read on one day, in one book, as the runs they were read in. */
export type DayEntry = {
  day: DayKey;
  chapters: number[];
  /** "6-14", or "3, 6-8", so a day reads as what it was rather than a list. */
  label: string;
};

/** "1, 3-5, 9" from [1,3,4,5,9]. A run is easier to recognise than its members. */
export function summariseRuns(chapters: readonly number[]): string {
  const sorted = [...chapters].sort((a, b) => a - b);
  const parts: string[] = [];
  let start: number | null = null;
  let prev: number | null = null;

  for (const c of sorted) {
    if (start === null) {
      start = c;
    } else if (prev !== null && c !== prev + 1) {
      parts.push(start === prev ? `${start}` : `${start}-${prev}`);
      start = c;
    }
    prev = c;
  }
  if (start !== null && prev !== null) parts.push(start === prev ? `${start}` : `${start}-${prev}`);
  return parts.join(', ');
}

/**
 * What was read in one book, grouped by the day it was read, most recent first.
 *
 * Answers the only question the strip of squares cannot: not whether a chapter
 * is read, but *when*. Chapters with no day came from an import that predates
 * the journal, so they are gathered under no day at all rather than guessed at.
 */
export function bookLog(read: ReadMap, book: string, chapters: number): DayEntry[] {
  const byDay = new Map<DayKey, number[]>();
  const undated: number[] = [];

  for (let c = 1; c <= chapters; c++) {
    const key = `${book}|${c}`;
    if (!(key in read)) continue;
    const day = read[key];
    if (day === null) {
      undated.push(c);
      continue;
    }
    const list = byDay.get(day);
    if (list) list.push(c);
    else byDay.set(day, [c]);
  }

  const entries: DayEntry[] = [...byDay.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([day, list]) => ({ day, chapters: list, label: summariseRuns(list) }));

  if (undated.length > 0) {
    entries.push({ day: '', chapters: undated, label: summariseRuns(undated) });
  }
  return entries;
}

/** Every day the reader read anything, most recent first, across the whole journal. */
export function recentDays(
  read: ReadMap,
  limit = 14,
): { day: DayKey; total: number; books: { book: string; label: string }[] }[] {
  const byDay = new Map<DayKey, Map<string, number[]>>();

  for (const [key, day] of Object.entries(read)) {
    if (!day) continue;
    const cut = key.lastIndexOf('|');
    const book = key.slice(0, cut);
    const chapter = Number(key.slice(cut + 1));
    if (!Number.isFinite(chapter)) continue;

    let books = byDay.get(day);
    if (!books) {
      books = new Map();
      byDay.set(day, books);
    }
    const list = books.get(book);
    if (list) list.push(chapter);
    else books.set(book, [chapter]);
  }

  return [...byDay.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, limit)
    .map(([day, books]) => ({
      day,
      total: [...books.values()].reduce((n, list) => n + list.length, 0),
      books: [...books.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([book, list]) => ({ book, label: summariseRuns(list) })),
    }));
}

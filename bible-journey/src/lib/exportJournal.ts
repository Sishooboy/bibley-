import { today, type DayKey } from './dates';
import type { AppData } from './storage';

export type JournalExport = AppData & {
  /** When the copy was taken. */
  exportedAt: string;
  app: 'Bibley';
};

/**
 * The journal, exactly as stored, with two lines saying where it came from.
 *
 * **Deliberately not an envelope** like `{ meta, journal }`. `normalize()`
 * accepts any object carrying a top-level `read` map and drops what it does not
 * recognise, so a file in this shape is itself a valid journal and can be read
 * straight back in by code that knows nothing about exports. Wrapping it would
 * need an unwrapping step that does not exist, and the entire point of this file
 * is to be readable by whatever comes next.
 *
 * It is a copy of the blob, not a summary of it: tombstones, timestamps and
 * time-of-day tags are all in here, because a backup that loses the fields that
 * settle a merge is a backup that changes your journal when you restore it.
 */
export function buildExport(data: AppData, at: Date = new Date()): JournalExport {
  /*
   * A deep copy, not a spread. Spreading the journal copies the top level and
   * leaves `read`, `notes` and `highlights` pointing at the live objects, so
   * what gets written is whatever the journal happens to be at the moment the
   * file is serialised rather than the moment the button was pressed. A backup
   * that is not a snapshot is not a backup.
   */
  return { ...structuredClone(data), exportedAt: at.toISOString(), app: 'Bibley' };
}

/** Matches the `bibley-backup-*.json` line already in the repo's .gitignore. */
export function exportFilename(day: DayKey = today()): string {
  return `bibley-backup-${day}.json`;
}

export type JournalCounts = {
  chapters: number;
  books: number;
  notes: number;
  highlights: number;
};

/**
 * What is actually in the file. Shown next to the button, because a backup
 * button that quietly writes an empty file is worse than no button at all.
 */
export function countJournal(data: AppData): JournalCounts {
  const books = new Set<string>();
  for (const key of Object.keys(data.read)) {
    // Book names contain the separator in "1 Samuel|3", so split on the last one.
    books.add(key.slice(0, key.lastIndexOf('|')));
  }
  return {
    chapters: Object.keys(data.read).length,
    books: books.size,
    notes: data.notes.length,
    highlights: data.highlights?.length ?? 0,
  };
}

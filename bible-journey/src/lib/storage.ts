import { isPlanId, type PlanId } from '../data/plans';
import { normalizePrefs, type Prefs } from './prefs';
import type { DayKey } from './dates';
import { today } from './dates';

export const STORAGE_KEY = 'bible-journey/v1';
/** Written once a day, one revision behind, so a bad write is never the only copy. */
export const BACKUP_KEY = 'bible-journey/v1.backup';
const CORRUPT_PREFIX = 'bible-journey/v1.corrupt.';

/** `null` marks a chapter read before the journal started, from an imported file. */
export type ReadValue = DayKey | null;

/** Key format: `${book}|${chapter}`. Book names are unique across the plan. */
export type ReadMap = Record<string, ReadValue>;

export type Note = {
  id: string;
  book: string;
  /** `null` = a note on the whole book. */
  chapter: number | null;
  text: string;
  createdAt: string;
  updatedAt: string;
};

export type AppData = {
  version: 1;
  /** Undefined until the reader picks one, which is what triggers the chooser. */
  planId?: PlanId;
  read: ReadMap;
  notes: Note[];
  startedAt: DayKey;
  /** Day of the last backup snapshot, so we only take one per day. */
  backedUpAt?: DayKey;
  /**
   * Which account this cache belongs to. Undefined means it predates any sign-in,
   * so it merges into the first account that claims it. A mismatch means another
   * account used this browser, and the cache is replaced rather than merged.
   */
  ownerId?: string;
  /**
   * Chapter keys that were deliberately unmarked, with when. Without these a
   * union merge treats a deletion as "missing" and helpfully restores it.
   */
  removed?: Record<string, string>;
  /**
   * When each chapter was last marked. `read` only holds the day, which cannot
   * settle a clear and a re-mark that happen on the same day. This can.
   */
  markedAt?: Record<string, string>;
  /** Reader settings, synced so they follow the account rather than the device. */
  prefs?: Prefs;
};

export type LoadResult = {
  data: AppData;
  /** How the data came back, for the UI to report honestly. */
  source: 'fresh' | 'primary' | 'backup';
  /** Set when the primary record was unreadable and got quarantined. */
  quarantinedKey?: string;
};

export function chapterKey(book: string, chapter: number): string {
  return `${book}|${chapter}`;
}

export function parseChapterKey(key: string): { book: string; chapter: number } {
  const i = key.lastIndexOf('|');
  return { book: key.slice(0, i), chapter: Number(key.slice(i + 1)) };
}

export function emptyData(): AppData {
  return { version: 1, read: {}, notes: [], startedAt: today() };
}

/** Accepts anything shaped like a journal; unknown fields are dropped, not trusted. */
export function normalize(input: unknown): AppData | null {
  if (typeof input !== 'object' || input === null) return null;
  const raw = input as Partial<AppData>;
  if (typeof raw.read !== 'object' || raw.read === null) return null;

  const read: ReadMap = {};
  for (const [key, value] of Object.entries(raw.read)) {
    if (typeof key !== 'string' || !key.includes('|')) continue;
    if (value === null || typeof value === 'string') read[key] = value;
  }

  const notes: Note[] = Array.isArray(raw.notes)
    ? raw.notes.filter(
        (n): n is Note =>
          !!n &&
          typeof n.id === 'string' &&
          typeof n.book === 'string' &&
          typeof n.text === 'string' &&
          (n.chapter === null || typeof n.chapter === 'number'),
      )
    : [];

  return {
    version: 1,
    planId: isPlanId(raw.planId) ? raw.planId : undefined,
    read,
    notes,
    startedAt: typeof raw.startedAt === 'string' ? raw.startedAt : today(),
    backedUpAt: typeof raw.backedUpAt === 'string' ? raw.backedUpAt : undefined,
    ownerId: typeof raw.ownerId === 'string' ? raw.ownerId : undefined,
    removed: normalizeRemoved(raw.removed),
    markedAt: normalizeRemoved(raw.markedAt),
    prefs: normalizePrefs(raw.prefs),
  };
}

/** Shared shape: chapter key to ISO timestamp. Used by `removed` and `markedAt`. */
function normalizeRemoved(input: unknown): Record<string, string> | undefined {
  if (typeof input !== 'object' || input === null) return undefined;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    if (key.includes('|') && typeof value === 'string') out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function readKey(key: string): AppData | null {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try {
    return normalize(JSON.parse(raw));
  } catch {
    return null;
  }
}

/**
 * Primary first, then the daily backup. A primary that exists but won't parse is
 * copied aside rather than overwritten, so nothing is ever silently destroyed.
 */
export function loadData(): LoadResult {
  try {
    const primary = readKey(STORAGE_KEY);
    if (primary) return { data: primary, source: 'primary' };

    const hadPrimary = localStorage.getItem(STORAGE_KEY) !== null;
    let quarantinedKey: string | undefined;
    if (hadPrimary) {
      quarantinedKey = `${CORRUPT_PREFIX}${Date.now()}`;
      localStorage.setItem(quarantinedKey, localStorage.getItem(STORAGE_KEY) ?? '');
    }

    const backup = readKey(BACKUP_KEY);
    if (backup) return { data: backup, source: 'backup', quarantinedKey };

    return { data: emptyData(), source: 'fresh', quarantinedKey };
  } catch (err) {
    console.error('Storage unavailable, running in memory only.', err);
    return { data: emptyData(), source: 'fresh' };
  }
}

export function saveData(data: AppData): void {
  try {
    const day = today();
    const previous = localStorage.getItem(STORAGE_KEY);

    // Before the first write of a new day, park yesterday's copy as the backup.
    // Only ever back up a blob that parses, so a good backup can't be clobbered.
    if (previous) {
      let parsed: Partial<AppData> | null = null;
      try {
        parsed = JSON.parse(previous) as Partial<AppData>;
      } catch {
        parsed = null;
      }
      if (parsed && parsed.backedUpAt !== day) localStorage.setItem(BACKUP_KEY, previous);
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...data, backedUpAt: day }));
  } catch (err) {
    console.error('Could not save progress.', err);
  }
}

/**
 * Ask the browser to exempt this origin from automatic eviction. Chrome grants it
 * on engagement, Safari grants it once the app is on the home screen.
 */
export async function requestPersistence(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  try {
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}




export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

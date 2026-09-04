/**
 * A book introducing itself the first time you open it, and a chapter saying
 * why it matters.
 *
 * The words live in `public/bible/insights.json`, beside the text and fetched
 * the same way: on demand, cached in memory, and kept by the service worker
 * once seen. They are not bundled for the same reason the text is not, which is
 * that 60 KB of prose has no business in the JavaScript. The `/bible/` path is
 * deliberate: that prefix is cache first with no revalidation, so the file is
 * there offline, and **changing it requires bumping `CACHE` in `sw.js`** like
 * any other file under it.
 */

export type ChapterNote = { title: string; note: string };

export type BookInsight = {
  /** One line under the name: what this book is. */
  eyebrow: string;
  /** Three short facts, each a sentence. */
  facts: string[];
  /** Keyed by chapter number as a string, since JSON keys are. */
  chapters?: Record<string, ChapterNote>;
};

export type Insights = { version: number; books: Record<string, BookInsight> };

const EMPTY: Insights = { version: 1, books: {} };

let cache: Insights | undefined;
let inFlight: Promise<Insights> | undefined;

export function cachedInsights(): Insights | undefined {
  return cache;
}

/**
 * Fetches once and remembers. A failure resolves to an empty set rather than
 * rejecting, and is not remembered, so the reader carries on without a card and
 * the next open tries again. Nothing here may ever stop a chapter from
 * showing.
 */
export function loadInsights(): Promise<Insights> {
  if (cache) return Promise.resolve(cache);
  if (inFlight) return inFlight;
  inFlight = fetch('/bible/insights.json')
    .then((res) => (res.ok ? (res.json() as Promise<Insights>) : EMPTY))
    .then((data) => {
      if (data && typeof data === 'object' && data.books) cache = data;
      return cache ?? EMPTY;
    })
    .catch(() => EMPTY)
    .finally(() => {
      inFlight = undefined;
    });
  return inFlight;
}

export function bookInsight(ins: Insights | undefined, book: string): BookInsight | undefined {
  return ins?.books[book];
}

export function chapterNote(
  ins: Insights | undefined,
  book: string,
  chapter: number,
): ChapterNote | undefined {
  return ins?.books[book]?.chapters?.[String(chapter)];
}

/*
 * What has been seen, kept on this device and not synced. Seeing a book's card
 * again on a second device is a small redundancy, not a harm, and this keeps
 * the journal blob and its whitelist untouched. Same reasoning as the voice.
 */
const SEEN_KEY = 'bible-journey/insights-seen';

export const sheetKey = (book: string): string => book;
export const noteSeenKey = (book: string, chapter: number): string => `${book}|${chapter}`;

export function seenSet(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(list) ? list.filter((k) => typeof k === 'string') : []);
  } catch {
    return new Set();
  }
}

export function markSeen(key: string): void {
  try {
    const set = seenSet();
    set.add(key);
    localStorage.setItem(SEEN_KEY, JSON.stringify([...set]));
  } catch (err) {
    console.error('Could not remember what has been seen.', err);
  }
}

export type NoteMode = 'reveal' | 'static' | 'none';

/**
 * What to show when a chapter opens. Pure, so the rules can be pinned.
 *
 * The book's card presents itself once, on the first open of a book with none
 * of it read. Not "chapter 1", because someone who opens Psalms at 23 is still
 * starting Psalms, and not "never seen" alone, because a reader who was halfway
 * through Genesis before this existed should not be introduced to it. After
 * that it stays a tap away behind the pill, and never presents itself again.
 *
 * A chapter's note reveals itself once and is simply there after, so a reader
 * returning to a chapter is not made to watch the same lines rise twice.
 */
export function presentation(input: {
  hasBook: boolean;
  seenBook: boolean;
  readInBook: number;
  hasNote: boolean;
  seenNote: boolean;
}): { sheet: boolean; note: NoteMode } {
  const sheet = input.hasBook && !input.seenBook && input.readInBook === 0;
  const note: NoteMode = !input.hasNote ? 'none' : input.seenNote ? 'static' : 'reveal';
  return { sheet, note };
}

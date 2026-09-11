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

/**
 * A heading over a paragraph, and sometimes a word about why it is there.
 *
 * One shape does both jobs on purpose. A section heading and an explained key
 * verse are the same thing structurally, "at verse N of this chapter, say
 * something", and splitting them into two files would have meant authoring the
 * same list of turning points twice and keeping the two in step by hand.
 *
 * `v` is the verse the heading sits above, `t` the heading, and `n` the note
 * that turns a heading into a moment worth stopping on. Most have no note: a
 * heading every few paragraphs is what makes a chapter navigable, and a chapter
 * where every heading demanded attention would be a chapter nobody could read.
 */
export type Section = { v: number; t: string; n?: string };

export type BookInsight = {
  /** One line under the name: what this book is. */
  eyebrow: string;
  /** Three short facts, each a sentence. */
  facts: string[];
  /** Keyed by chapter number as a string, since JSON keys are. */
  chapters?: Record<string, ChapterNote>;
  /** Headings over the paragraphs, keyed by chapter number as a string. */
  sections?: Record<string, Section[]>;
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

/**
 * The headings for one chapter, in verse order.
 *
 * Sorted here rather than trusted from the file, because a heading out of order
 * would attach itself to the wrong paragraph and the data is hand written.
 */
export function sectionsFor(
  ins: Insights | undefined,
  book: string,
  chapter: number,
): Section[] {
  const list = ins?.books[book]?.sections?.[String(chapter)];
  return list ? [...list].sort((a, b) => a.v - b.v) : [];
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
 * The book's card presents itself once, the first time a book is opened in the
 * reader, and never again. Not "chapter 1", because someone who opens Psalms at
 * 23 is still starting Psalms.
 *
 * **It used to also require that none of the book had been marked, and that was
 * wrong in the flow people actually use.** Chapters are marked from the journey
 * screen far more often than from inside the reader, so by the time somebody
 * opened a book for the first time it was frequently already "not new" and the
 * card silently never appeared. The guard was written for readers who were
 * mid-Genesis when this feature shipped, which is a problem that expired; the
 * cost of dropping it is that somebody deep into a book they had never opened
 * here gets introduced to it once, which is a card and a tap.
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
  const sheet = input.hasBook && !input.seenBook;
  const note: NoteMode = !input.hasNote ? 'none' : input.seenNote ? 'static' : 'reveal';
  return { sheet, note };
}

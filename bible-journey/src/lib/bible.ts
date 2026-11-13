import { DEFAULT_TRANSLATION, translationById, type TranslationId } from './translations';

export type BookText = {
  book: string;
  translation: string;
  /**
   * Index 0 is chapter 1. Each entry is that chapter's verses, in order.
   *
   * A null verse is a number the King James tradition carries but this
   * translation's source text does not, Luke 17:36 and Acts 8:37 among them.
   * The slot stays so the numbering after it is still right, and the reader
   * simply does not draw it.
   */
  chapters: (string | null)[][];
  /**
   * One string a chapter, one character a verse, saying where paragraphs open
   * and which lines are poetry. Built by `scripts/build-layout.mjs` from the
   * WEB's own USFM and decoded by `blocksFor` in `passage.ts`.
   *
   * Optional, and an empty string for a chapter is meaningful rather than
   * missing: it says this chapter has no layout and keeps the setting the
   * reader had before any of this, one verse a paragraph.
   */
  layout?: string[];
};

/**
 * The text is 4.4 MB a translation across 73 files, so it is fetched per book
 * rather than bundled. A book is a session's worth of reading, which makes it the
 * right unit: one request covers everything you are likely to open next, and the
 * service worker keeps it for later.
 *
 * Every function here takes the translation and defaults to the World English
 * Bible. The default is deliberate rather than lazy: the quiz's proof verses and
 * a passage a friend sent are the WEB's words whatever is open in the reader,
 * because that is the text their quotes and offsets were taken from.
 */
const cache = new Map<string, BookText>();
/** Two chapters of the same book opening at once must not fetch it twice. */
const inFlight = new Map<string, Promise<BookText>>();

const keyOf = (book: string, translation: TranslationId) => `${translation}:${book}`;

export function bookSlug(book: string): string {
  return book.toLowerCase().replace(/\s+/g, '-');
}

export function cachedBook(book: string, translation: TranslationId = DEFAULT_TRANSLATION): BookText | undefined {
  return cache.get(keyOf(book, translation));
}

/**
 * Offline with the book already cached is the good case and must still work, so
 * this asks the cache directly rather than refusing on `navigator.onLine` alone.
 * Only a book that is genuinely absent, with no connection to go and get it,
 * fails, and it fails at once instead of after a connection timeout.
 */
async function missingWithNoWayToGetIt(url: string): Promise<boolean> {
  if (typeof navigator === 'undefined' || navigator.onLine !== false) return false;
  if (typeof caches === 'undefined') return true;
  try {
    return (await caches.match(url)) === undefined;
  } catch {
    return false;
  }
}

export async function loadBook(book: string, translation: TranslationId = DEFAULT_TRANSLATION): Promise<BookText> {
  const key = keyOf(book, translation);
  const hit = cache.get(key);
  if (hit) return hit;

  const pending = inFlight.get(key);
  if (pending) return pending;

  const url = `${translationById(translation).dir}${bookSlug(book)}.json`;
  const request = (async () => {
    if (await missingWithNoWayToGetIt(url)) {
      throw new Error(`${book} has not been downloaded`);
    }
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Could not load ${book} (${response.status})`);
    const text = (await response.json()) as BookText;
    cache.set(key, text);
    return text;
  })().finally(() => inFlight.delete(key));

  inFlight.set(key, request);
  return request;
}

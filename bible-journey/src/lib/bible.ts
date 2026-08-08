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
};

export const TRANSLATION_NAME = 'World English Bible';

/**
 * The text is 4.4 MB across 73 files, so it is fetched per book rather than
 * bundled. A book is a session's worth of reading, which makes it the right unit:
 * one request covers everything you are likely to open next, and the service
 * worker keeps it for later.
 */
const cache = new Map<string, BookText>();
/** Two chapters of the same book opening at once must not fetch it twice. */
const inFlight = new Map<string, Promise<BookText>>();

export function bookSlug(book: string): string {
  return book.toLowerCase().replace(/\s+/g, '-');
}

export function cachedBook(book: string): BookText | undefined {
  return cache.get(book);
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

export async function loadBook(book: string): Promise<BookText> {
  const hit = cache.get(book);
  if (hit) return hit;

  const pending = inFlight.get(book);
  if (pending) return pending;

  const url = `/bible/${bookSlug(book)}.json`;
  const request = (async () => {
    if (await missingWithNoWayToGetIt(url)) {
      throw new Error(`${book} has not been downloaded`);
    }
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Could not load ${book} (${response.status})`);
    const text = (await response.json()) as BookText;
    cache.set(book, text);
    return text;
  })().finally(() => inFlight.delete(book));

  inFlight.set(book, request);
  return request;
}

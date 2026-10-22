/**
 * Where the questions come from: one JSON file per book under `src/data/quiz/`,
 * each its own chunk, fetched when a quiz is opened and never in the main
 * bundle.
 *
 * **Imported through Vite rather than served from `public/bible/`, on
 * purpose.** The service worker serves `/bible/` cache first with no
 * revalidation, so a corrected question there would sit on every device until
 * `CACHE` was bumped, and a bump throws away every reader's downloaded books.
 * Questions will be corrected more often than scripture will. A chunk is
 * fingerprinted, so a fixed question is a new file name and arrives on its own.
 */
import { CANON } from '../data/canon';
import { bookQuizKey, type BookQuiz } from './quiz';

const FILES = import.meta.glob<{ default: BookQuiz }>('../data/quiz/*.json');

const bySlug = new Map(
  Object.entries(FILES).map(([path, load]) => [path.replace(/^.*\/|\.json$/g, ''), load]),
);

/** Books with a quiz written, in printed order. Known without loading any of them. */
export const QUIZ_BOOKS: readonly string[] = CANON.filter((book) => bySlug.has(bookQuizKey(book)));

export function hasQuiz(book: string): boolean {
  return bySlug.has(bookQuizKey(book));
}

const cache = new Map<string, Promise<BookQuiz>>();

/** One book's questions, loaded once and shared, the way `loadBook` shares the text. */
export function loadQuiz(book: string): Promise<BookQuiz> {
  const slug = bookQuizKey(book);
  const known = cache.get(slug);
  if (known) return known;
  const load = bySlug.get(slug);
  if (!load) return Promise.reject(new Error(`No quiz for ${book}`));
  const pending = load().then((m) => m.default);
  // A failed load is forgotten, so the next tap can try again on a better connection.
  pending.catch(() => cache.delete(slug));
  cache.set(slug, pending);
  return pending;
}

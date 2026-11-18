import { useSyncExternalStore } from 'react';
import { CANON } from '../data/canon';
import { bookUrl } from './bible';
import { INSIGHTS_URL } from './insights';
import { booksIn, type TranslationId } from './translations';

/**
 * Saving the whole Bible on this device, and knowing how much of it already is.
 *
 * The service worker keeps every book the reader opens, so the text is already
 * offline one book at a time. What it cannot do is keep a book nobody opened,
 * which is the one a reader on a plane reaches for. This fetches the rest, on
 * request, through the very URLs the reader uses, so the worker's existing
 * cache-first rule for `/bible/` stores them and nothing about how a book is
 * served changes.
 *
 * **What is saved is read off the Cache API, every time, and never remembered.**
 * A flag saying "this device has the whole Bible" would be wrong the moment a
 * browser cleared the cache to make room, which it is entitled to do, and wrong
 * again after every `CACHE` bump in `sw.js`, which deletes the old cache whole.
 * Asking the cache costs one `keys()` and cannot drift, so the count in Settings
 * is always what a reader would actually find with no connection.
 */

/*
 * The size of every file under public/bible/, measured by `vite.config.ts` from
 * the files the build ships. Declared rather than imported because `define`
 * replaces it with a literal at build time and in the tests alike.
 */
declare const __BIBLE_BYTES__: Record<string, number>;

/**
 * The service worker's cache, by name. It has to equal `CACHE` in
 * `public/sw.js`, and `offline.test.ts` reads that file and fails if it does
 * not, because a page counting one cache while the worker fills another would
 * say "nothing saved" over a full cache.
 *
 * **Bumping it wipes every book anybody saved.** The worker's activate step
 * deletes every cache with another name, and that is exactly what a bump is for,
 * since the files under /bible/ are not fingerprinted. Nothing here re-saves
 * behind a reader's back afterwards: five megabytes nobody asked for, on a
 * phone's data, is not a courtesy. The card in Settings reads the empty cache
 * and offers the save again, which is the honest result.
 */
export const SW_CACHE = 'bibley-v6';

export function bytesOf(url: string): number {
  return __BIBLE_BYTES__[url] ?? 0;
}

/**
 * Everything reading one translation offline needs: its books, and the
 * headings, introductions and notes, which are one file every translation shares.
 * Its books, not the canon's: the Free Bible Version has 66, and a save that
 * asked for the seven it does not have would fail on the first of them.
 * Without that file the reader still works, but every heading disappears.
 */
export function filesFor(translation: TranslationId): string[] {
  return [...booksIn(translation, CANON).map((book) => bookUrl(book, translation)), INSIGHTS_URL];
}

export type Coverage = {
  /** Books of this translation already in the cache. */
  books: number;
  /** Books this translation has: 73, or 66 for one without the deuterocanon. */
  total: number;
  /** What a save still has to fetch, in printed order, the shared file last. */
  missing: string[];
  /** Their size on disk, which is also what they will take up in the cache. */
  missingBytes: number;
};

export function coverage(translation: TranslationId, have: ReadonlySet<string>): Coverage {
  const books = booksIn(translation, CANON).map((book) => bookUrl(book, translation));
  const missing = filesFor(translation).filter((url) => !have.has(url));
  return {
    books: books.filter((url) => have.has(url)).length,
    total: books.length,
    missing,
    missingBytes: missing.reduce((sum, url) => sum + bytesOf(url), 0),
  };
}

export type Outcome = 'done' | 'stopped' | 'failed';

type SaveOptions = {
  /** Stops new files starting. A file already in flight is let finish. */
  signal: AbortSignal;
  /** Told once per file, only after `saveOne` has resolved for it. */
  onSaved: (url: string) => void;
  /** How many files are in flight at once. */
  lanes?: number;
  /** The pause before the one retry a file gets, in milliseconds. */
  retryAfter?: number;
};

/**
 * Saves each URL through `saveOne`, a few at a time.
 *
 * A file that fails is tried once more after a pause, because a phone's
 * connection drops for a second far more often than it drops for good. A file
 * that fails twice stops the whole run instead of carrying on: the cause is
 * nearly always the connection or the device being out of room, and both fail
 * every remaining file the same way. Nothing already saved is undone, so the
 * next attempt starts from where this one stopped.
 *
 * **Stopping does not cut a file off half way, and that is what keeps the count
 * true.** Aborting the page's fetch does not abort the worker's: it goes on and
 * stores the file a moment later, after the count has been read, so the first
 * version of Stop left the card saying three books over a cache holding six.
 * Letting the files in flight land, at most `lanes` of them, means the promise
 * this returns resolves only once nothing more is going to arrive, and the count
 * read after it is final.
 *
 * `saveOne` is a parameter so the scheduling can be tested without a browser.
 */
export async function saveEach(
  urls: readonly string[],
  saveOne: (url: string) => Promise<void>,
  { signal, onSaved, lanes = 4, retryAfter = 800 }: SaveOptions,
): Promise<Outcome> {
  let next = 0;
  let failed = false;

  const attempt = async (url: string) => {
    try {
      await saveOne(url);
    } catch (err) {
      if (signal.aborted) throw err;
      await new Promise((resolve) => setTimeout(resolve, retryAfter));
      if (signal.aborted) throw err;
      await saveOne(url);
    }
  };

  const lane = async () => {
    while (next < urls.length && !failed && !signal.aborted) {
      const url = urls[next++];
      try {
        await attempt(url);
        onSaved(url);
      } catch {
        if (!signal.aborted) failed = true;
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(lanes, urls.length) }, lane));
  if (signal.aborted) return 'stopped';
  return failed ? 'failed' : 'done';
}

/*
 * One file, fetched through the worker and checked for in the cache.
 *
 * Normally the worker has already stored it by the time the response arrives,
 * because its cache-first handler awaits the put before handing the response
 * over. A hard reload is the exception: it sends every request from that page
 * straight past the worker, and so does the first visit before the worker has
 * claimed the page, so in either case the page puts it in itself. Then the
 * cache is asked, since a save that only believed the worker would count a file
 * it never kept.
 *
 * `ignoreVary` because a response carrying `Vary` would otherwise fail to match
 * a bare URL even though it is there, and the save would put a second copy.
 */
async function saveOne(url: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  const cache = await caches.open(SW_CACHE);
  if (await cache.match(url, { ignoreVary: true })) {
    await response.body?.cancel().catch(() => undefined);
  } else {
    await cache.put(url, response);
  }
  if (!(await cache.match(url, { ignoreVary: true }))) {
    throw new Error(`${url} was fetched but not kept`);
  }
}

/** Every path in the worker's cache, read without creating the cache if it is absent. */
async function cachedPaths(): Promise<Set<string>> {
  try {
    if (!(await caches.has(SW_CACHE))) return new Set();
    const keys = await (await caches.open(SW_CACHE)).keys();
    return new Set(keys.map((request) => new URL(request.url).pathname));
  } catch {
    return new Set();
  }
}

/**
 * Whether there is a service worker to save into.
 *
 * `dev` is its own answer rather than a kind of `none`, because `npm run dev`
 * deliberately runs without a worker (see `main.tsx`) and the card should say
 * that instead of offering a save that would put files in a cache nothing reads.
 */
export type Support = 'checking' | 'ready' | 'dev' | 'none';

let detecting: Promise<Support> | undefined;

function detect(): Promise<Support> {
  detecting ??= (async (): Promise<Support> => {
    if (!import.meta.env.PROD) return 'dev';
    if (!('serviceWorker' in navigator) || typeof caches === 'undefined') return 'none';
    try {
      if (await navigator.serviceWorker.getRegistration()) return 'ready';
      // `main.tsx` registers on window load, so Settings opened in the first
      // moment can get here first. A browser that refuses workers outright, a
      // private window for instance, never becomes ready, hence the limit.
      const ready = await Promise.race([
        navigator.serviceWorker.ready.then(() => true),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 5000)),
      ]);
      return ready ? 'ready' : 'none';
    } catch {
      return 'none';
    }
  })();
  return detecting;
}

/*
 * Asks the browser not to clear this site's storage when the device runs short
 * of space. Browsers answer differently, some deciding for themselves and
 * Firefox asking the reader, so it is called on the tap, where there is a
 * gesture to prompt from. A refusal changes nothing about the save and is not
 * reported: the books are kept all the same, only on the same terms as
 * everything else the site stores, and if they are ever cleared the count in
 * Settings says so, because it is read off the cache.
 */
function askToKeep(): void {
  try {
    void navigator.storage?.persist?.().catch(() => undefined);
  } catch {
    // No storage manager at all: nothing to ask.
  }
}

/**
 * A save in progress, or the last one this session, for one translation.
 * `stopping` is the moment between Stop and the files in flight landing.
 */
export type Job = { translation: TranslationId; outcome: Outcome | null; stopping?: boolean };

export type OfflineState = {
  support: Support;
  /** Paths in the worker's cache, or null until it has been read once. */
  have: ReadonlySet<string> | null;
  job: Job | null;
};

/*
 * Module state rather than component state, so a save keeps going when the
 * reader leaves Settings to go and read, and the card shows it still running
 * when they come back.
 */
let state: OfflineState = { support: 'checking', have: null, job: null };
let controller: AbortController | null = null;
const listeners = new Set<() => void>();

function update(patch: Partial<OfflineState>): void {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useOffline(): OfflineState {
  return useSyncExternalStore(subscribe, () => state, () => state);
}

/** Reads the cache again. Cheap, and the only source of the counts. */
export async function refreshOffline(): Promise<void> {
  const support = await detect();
  update({ support, have: support === 'ready' ? await cachedPaths() : new Set() });
}

export async function saveForOffline(translation: TranslationId): Promise<void> {
  if (controller || state.support !== 'ready') return;
  askToKeep();
  controller = new AbortController();
  const { signal } = controller;
  update({ job: { translation, outcome: null } });

  let outcome: Outcome = 'failed';
  try {
    const kept = new Set(await cachedPaths());
    update({ have: new Set(kept) });
    outcome = await saveEach(coverage(translation, kept).missing, saveOne, {
      signal,
      onSaved: (url) => {
        kept.add(url);
        update({ have: new Set(kept) });
      },
    });
  } finally {
    controller = null;
    // The last word is the cache's, not the tally kept along the way.
    update({ have: await cachedPaths(), job: { translation, outcome } });
  }
}

export function stopSaving(): void {
  if (!controller || controller.signal.aborted || !state.job) return;
  controller.abort();
  update({ job: { ...state.job, stopping: true } });
}

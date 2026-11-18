import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CANON } from '../data/canon';
import { bookUrl } from './bible';
import { INSIGHTS_URL } from './insights';
import { SW_CACHE, bytesOf, coverage, filesFor, saveEach } from './offline';
import { TRANSLATIONS } from './translations';

const sw = readFileSync(join(process.cwd(), 'public/sw.js'), 'utf8');
const onDisk = (url: string) => join(process.cwd(), 'public', url);

describe('the cache the count is read from', () => {
  /*
   * The page counts one cache and the worker fills one. If they are not the
   * same cache, the card says nothing is saved over a full one, or worse, the
   * save writes into a cache the worker deletes on its next activate.
   */
  it('is the cache the service worker writes to', () => {
    const declared = sw.match(/const CACHE = '([^']+)'/);
    expect(declared, 'public/sw.js no longer declares CACHE the way this test reads it').not.toBeNull();
    expect(SW_CACHE).toBe(declared?.[1]);
  });

  /*
   * The save relies on the worker's existing rule rather than a route of its
   * own, so every file it asks for has to fall under that rule, or it would be
   * fetched and never kept.
   */
  it('holds every file a save asks for under the prefix the worker caches first', () => {
    expect(sw).toContain("url.pathname.startsWith('/bible/')");
    for (const t of TRANSLATIONS) {
      for (const url of filesFor(t.id)) expect(url.startsWith('/bible/'), url).toBe(true);
    }
  });
});

describe('what a save fetches', () => {
  it('is every book of the translation and the shared headings, by the URLs the reader uses', () => {
    for (const t of TRANSLATIONS) {
      const files = filesFor(t.id);
      const books = CANON.filter((book) => !t.lacksBooks?.includes(book));
      expect(files).toHaveLength(books.length + 1);
      expect(files).toEqual([...books.map((book) => bookUrl(book, t.id)), INSIGHTS_URL]);
      expect(new Set(files).size).toBe(files.length);
    }
  });

  /*
   * The Free Bible Version is a protestant Bible. A save that asked for Tobit
   * would fail on a file that was never shipped, and stop the run there; a card
   * that counted 73 would never reach "all of them" however much it saved.
   */
  it('is never a book the translation does not have', () => {
    expect(filesFor('fbv')).not.toContain(bookUrl('Tobit', 'fbv'));
    expect(coverage('fbv', new Set()).total).toBe(66);
    const all = new Set(filesFor('fbv'));
    expect(coverage('fbv', all)).toMatchObject({ books: 66, total: 66, missing: [] });
  });

  /*
   * The size on the button is measured by vite.config.ts at build time. A file
   * it missed would count as nothing, and the button would name a size smaller
   * than the download.
   */
  it('is served from files that exist, sized exactly as they are on disk', () => {
    for (const t of TRANSLATIONS) {
      for (const url of filesFor(t.id)) {
        expect(existsSync(onDisk(url)), url).toBe(true);
        expect(bytesOf(url), url).toBe(statSync(onDisk(url)).size);
        expect(bytesOf(url), url).toBeGreaterThan(0);
      }
    }
  });
});

describe('coverage', () => {
  const web = filesFor('web');
  const kjv = filesFor('kjv');

  it('counts nothing saved as every file still to fetch', () => {
    const c = coverage('web', new Set());
    expect(c.books).toBe(0);
    expect(c.total).toBe(73);
    expect(c.missing).toEqual(web);
    expect(c.missingBytes).toBe(web.reduce((sum, url) => sum + bytesOf(url), 0));
  });

  it('counts books by translation, so the other translation saved is not this one saved', () => {
    const c = coverage('kjv', new Set(web));
    expect(c.books).toBe(0);
    // The headings are one file both share, so saving one translation saves them for the other.
    expect(c.missing).toEqual(kjv.filter((url) => url !== INSIGHTS_URL));
  });

  it('is complete only once the shared headings are there too', () => {
    const books = new Set(web.filter((url) => url !== INSIGHTS_URL));
    const c = coverage('web', books);
    expect(c.books).toBe(73);
    expect(c.missing).toEqual([INSIGHTS_URL]);
    expect(coverage('web', new Set(web)).missing).toEqual([]);
  });

  it('ignores what else the cache holds', () => {
    const c = coverage('web', new Set(['/', '/index.html', '/assets/index-abc.js', web[0]]));
    expect(c.books).toBe(1);
  });
});

describe('saveEach', () => {
  const urls = Array.from({ length: 10 }, (_, i) => `/bible/${i}.json`);

  it('saves every file, a few at a time, and reports each one', async () => {
    let inFlight = 0;
    let most = 0;
    const saved: string[] = [];
    const outcome = await saveEach(
      urls,
      async () => {
        inFlight += 1;
        most = Math.max(most, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 1));
        inFlight -= 1;
      },
      { signal: new AbortController().signal, onSaved: (url) => saved.push(url), lanes: 3 },
    );
    expect(outcome).toBe('done');
    expect([...saved].sort()).toEqual([...urls].sort());
    expect(most).toBe(3);
  });

  it('gives a file one more try before giving up on it', async () => {
    const tries = new Map<string, number>();
    const outcome = await saveEach(
      urls,
      async (url) => {
        const n = (tries.get(url) ?? 0) + 1;
        tries.set(url, n);
        if (url === urls[4] && n === 1) throw new Error('a dropped second');
      },
      { signal: new AbortController().signal, onSaved: () => undefined, retryAfter: 0 },
    );
    expect(outcome).toBe('done');
    expect(tries.get(urls[4])).toBe(2);
  });

  it('stops starting files once one has failed twice, and does not report it saved', async () => {
    const started: string[] = [];
    const saved: string[] = [];
    const outcome = await saveEach(
      urls,
      async (url) => {
        started.push(url);
        if (url === urls[2]) throw new Error('out of room');
      },
      { signal: new AbortController().signal, onSaved: (url) => saved.push(url), lanes: 1, retryAfter: 0 },
    );
    expect(outcome).toBe('failed');
    expect(saved).toEqual(urls.slice(0, 2));
    // Tried twice, then nothing after it.
    expect(started).toEqual([...urls.slice(0, 2), urls[2], urls[2]]);
  });

  it('stops starting files when told to, and lets the one in flight land', async () => {
    const control = new AbortController();
    const started: string[] = [];
    const saved: string[] = [];
    const outcome = await saveEach(
      urls,
      async (url) => {
        started.push(url);
        if (url === urls[3]) control.abort();
      },
      { signal: control.signal, onSaved: (url) => saved.push(url), lanes: 1, retryAfter: 0 },
    );
    expect(outcome).toBe('stopped');
    expect(started).toEqual(urls.slice(0, 4));
    // The file that was going when Stop came still reached the cache, so it counts.
    expect(saved).toEqual(urls.slice(0, 4));
  });

  /*
   * The count is read once this resolves. Aborting the page's fetch does not
   * stop the worker storing the file, so a run that resolved with files still
   * in flight had its count read too early: three books on the card, six in
   * the cache. That was found in a browser, and this is the pin for it.
   */
  it('resolves only after every file in flight has landed', async () => {
    const control = new AbortController();
    const saved: string[] = [];
    const run = saveEach(
      urls,
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      },
      { signal: control.signal, onSaved: (url) => saved.push(url), lanes: 3 },
    );
    control.abort();
    expect(await run).toBe('stopped');
    expect(saved).toEqual(urls.slice(0, 3));
  });

  it('does not retry a failed file once stopped', async () => {
    const control = new AbortController();
    let calls = 0;
    const outcome = await saveEach(
      urls,
      async () => {
        calls += 1;
        control.abort();
        throw new Error('dropped');
      },
      { signal: control.signal, onSaved: () => undefined, lanes: 1, retryAfter: 0 },
    );
    expect(outcome).toBe('stopped');
    expect(calls).toBe(1);
  });

  it('has nothing to do for nothing missing', async () => {
    const outcome = await saveEach([], async () => {
      throw new Error('should not be called');
    }, { signal: new AbortController().signal, onSaved: () => undefined });
    expect(outcome).toBe('done');
  });
});

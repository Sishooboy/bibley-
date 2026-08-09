import { useEffect, useRef, useState } from 'react';
import { CANON } from '../data/canon';
import { loadBook } from '../lib/bible';
import { excerpt, findInBook, type VerseHit } from '../lib/bibleSearch';
import { plural } from '../lib/format';
import { Search } from './icons';

/**
 * Enough to be useful, few enough that the list stays a list. A common word like
 * "God" is in several thousand verses, and nobody scrolls that.
 */
const LIMIT = 200;

/**
 * Searching the text itself, rather than the list of book names.
 *
 * It runs a book at a time through `loadBook`, which is the same fetch and the
 * same cache the reader uses, so a search warms the books you have not opened
 * and a second search is instant. That does mean the first one pulls the rest of
 * the Bible, which is why it reports progress and can be stopped.
 *
 * On a keypress it would do that 73 times a word, so it runs on submit.
 */
export function BibleSearch({
  onPick,
  onClose,
}: {
  onPick: (book: string, chapter: number, verse: number) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [asked, setAsked] = useState('');
  const [hits, setHits] = useState<VerseHit[]>([]);
  const [done, setDone] = useState(0);
  const [running, setRunning] = useState(false);
  const [missing, setMissing] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  /** Bumped to abandon a run: a new search, a stop, or the panel closing. */
  const runId = useRef(0);

  useEffect(() => {
    inputRef.current?.focus();
    return () => {
      runId.current += 1;
    };
  }, []);

  const stop = () => {
    runId.current += 1;
    setRunning(false);
  };

  const run = async (raw: string) => {
    const q = raw.trim();
    if (!q) return;

    const id = ++runId.current;
    setAsked(q);
    setHits([]);
    setMissing([]);
    setDone(0);
    setRunning(true);

    const found: VerseHit[] = [];
    const absent: string[] = [];

    for (let i = 0; i < CANON.length; i++) {
      if (runId.current !== id) return;
      try {
        const text = await loadBook(CANON[i]);
        if (runId.current !== id) return;
        const room = LIMIT - found.length;
        if (room > 0) {
          const more = findInBook(text, q, room);
          if (more.length > 0) {
            found.push(...more);
            setHits([...found]);
          }
        }
      } catch {
        // Offline with that book never opened. Worth saying at the end rather
        // than stopping the search over.
        absent.push(CANON[i]);
      }
      setDone(i + 1);
    }

    if (runId.current !== id) return;
    setMissing(absent);
    setRunning(false);
  };

  const full = hits.length >= LIMIT;

  return (
    <div className="bibleSearch">
      <form
        className="bibleSearch__bar"
        onSubmit={(e) => {
          e.preventDefault();
          void run(query);
        }}
      >
        <span className="searchBox bibleSearch__box">
          <Search size={15} className="searchBox__icon" />
          <input
            ref={inputRef}
            className="field searchBox__input"
            type="search"
            placeholder="A word or a phrase…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search the Bible text"
          />
        </span>
        <button type="submit" className="btn btn--sm btn--primary" disabled={!query.trim()}>
          Search
        </button>
        <button type="button" className="btn btn--sm btn--ghost" onClick={onClose}>
          Done
        </button>
      </form>

      <p className="bibleSearch__status" aria-live="polite">
        {running ? (
          <>
            Looking through the Bible, {done} of {CANON.length} books.{' '}
            <button type="button" className="linkBtn" onClick={stop}>
              Stop
            </button>
          </>
        ) : asked === '' ? (
          'Every word of all 73 books. The first search fetches the books you have not opened yet, so it takes a moment.'
        ) : hits.length === 0 ? (
          `Nothing matched “${asked}”.`
        ) : (
          <>
            {full ? `First ${LIMIT}` : plural(hits.length, 'verse')} for “{asked}”
            {full && ', there are more'}.
          </>
        )}
      </p>

      {missing.length > 0 && !running && (
        <p className="notice notice--gold">
          {plural(missing.length, 'book')} could not be fetched, so they were not searched. They
          download the first time you open them.
        </p>
      )}

      <div className="bibleSearch__hits">
        {hits.map((hit) => {
          const parts = excerpt(hit);
          return (
            <button
              key={`${hit.book}|${hit.chapter}|${hit.verse}`}
              type="button"
              className="hit"
              onClick={() => onPick(hit.book, hit.chapter, hit.verse)}
            >
              <span className="hit__ref">
                {hit.book} {hit.chapter}:{hit.verse}
              </span>
              <span className="hit__text">
                {parts.head}
                <mark>{parts.match}</mark>
                {parts.tail}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

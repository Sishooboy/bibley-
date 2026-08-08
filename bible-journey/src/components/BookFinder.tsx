import { useMemo, useState } from 'react';
import { rankBooks } from '../lib/bookSearch';
import { plural } from '../lib/format';
import { Search } from './icons';

/** Seventy-three books over eight screens, and no way to reach one but scrolling. */
export function BookFinder({
  books,
  onJump,
}: {
  books: string[];
  onJump: (book: string) => void;
}) {
  const [query, setQuery] = useState('');
  const hits = useMemo(() => rankBooks(books, query), [books, query]);
  const searching = query.trim() !== '';

  return (
    <div className="finder">
      <div className="searchBox finder__box">
        <Search size={15} className="searchBox__icon" />
        <input
          className="field searchBox__input"
          type="search"
          placeholder="Find a book…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Find a book"
          onKeyDown={(e) => {
            // Enter goes straight to the best match, so a book is two taps away.
            if (e.key === 'Enter' && hits.length > 0) {
              onJump(hits[0]);
              setQuery('');
            }
            if (e.key === 'Escape') setQuery('');
          }}
        />
      </div>

      {searching && (
        <div className="finder__hits">
          {hits.length === 0 ? (
            <p className="finder__none">No book by that name.</p>
          ) : (
            <>
              <span className="finder__count">{plural(hits.length, 'book')}</span>
              {hits.slice(0, 8).map((book) => (
                <button
                  key={book}
                  type="button"
                  className="chipBtn finder__hit"
                  onClick={() => {
                    onJump(book);
                    setQuery('');
                  }}
                >
                  {book}
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

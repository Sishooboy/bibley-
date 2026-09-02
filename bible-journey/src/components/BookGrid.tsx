import { useMemo } from 'react';
import { CANON } from '../data/canon';
import type { PhaseProgress } from '../lib/progress';
import { plural } from '../lib/format';

/**
 * Every book in the plan as one square, in printed order, filling up.
 *
 * The journey below this is a list, and a list answers "what is next" but never
 * "how far am I". This does, in one look, and it says the thing a percentage
 * cannot: which parts, and how evenly. It is also the fastest way to reach a
 * book, since tapping a square opens it wherever it is.
 *
 * Printed order, not the plan's reading order, so it is recognisable as a Bible
 * rather than as this app's opinion about what to read first.
 */
export function BookGrid({
  phases,
  onPick,
}: {
  phases: PhaseProgress[];
  onPick: (book: string) => void;
}) {
  const books = useMemo(() => {
    // Built from the same per-book progress the phase rows use, so the picture
    // and the list can never disagree about how far in a book is.
    const byName = new Map<string, { name: string; chapters: number; read: number }>();
    for (const phase of phases) for (const book of phase.books) byName.set(book.name, book);
    return CANON.filter((name) => byName.has(name)).map((name) => byName.get(name)!);
  }, [phases]);

  const done = books.filter((b) => b.read >= b.chapters).length;
  const started = books.filter((b) => b.read > 0 && b.read < b.chapters).length;

  return (
    <section className="bookGrid" aria-label="Every book in the plan">
      <div className="bookGrid__head">
        <p className="eyebrow">Book by book</p>
        <p className="bookGrid__count">
          <b>{done}</b> finished · {started} on the go · {books.length - done - started} to open
        </p>
      </div>

      <p className="bookGrid__hint">Genesis to Revelation. Tap any square to open that book.</p>

      <div className="bookGrid__grid">
        {books.map((book) => {
          const complete = book.read >= book.chapters;
          const part = book.chapters === 0 ? 0 : Math.min(1, book.read / book.chapters);
          return (
            <button
              key={book.name}
              type="button"
              className={`bookGrid__cell${complete ? ' bookGrid__cell--done' : ''}`}
              onClick={() => onPick(book.name)}
              title={`${book.name} · ${book.read}/${book.chapters}`}
              aria-label={`${book.name}, ${book.read} of ${plural(book.chapters, 'chapter')} read`}
            >
              {/* Fills from the bottom, the way you would fill a glass. */}
              <span
                className="bookGrid__fill"
                style={{ height: `${part * 100}%` }}
                aria-hidden="true"
              />
            </button>
          );
        })}
      </div>
    </section>
  );
}

import { useEffect, useRef, type CSSProperties } from 'react';
import type { BookInsight, ChapterNote as Note, NoteMode } from '../lib/insights';
import { reducedMotion } from '../lib/motion';

/**
 * A book introducing itself, over the text, the first time it is opened.
 *
 * It sits inside `reader__body` rather than over the whole reader, so the book
 * and chapter pickers in the bar stay usable: someone who opened the wrong book
 * should not have to dismiss an introduction to fix that. The body stops
 * scrolling while it is up and starts again when it goes.
 *
 * `replay` is a re-open from the pill. It still rises, because it is being
 * asked for, but it makes no sound: the chime is for the first arrival only.
 */
export function BookSheet({
  book,
  insight,
  replay,
  onBegin,
}: {
  book: string;
  insight: BookInsight;
  replay: boolean;
  onBegin: () => void;
}) {
  const go = useRef<HTMLButtonElement>(null);

  // The sheet covers the text, so a keyboard has to land on its one control.
  useEffect(() => {
    go.current?.focus({ preventScroll: true });
  }, []);

  return (
    <section
      className="insightSheet"
      data-calm={reducedMotion() ? '' : undefined}
      data-replay={replay ? '' : undefined}
      aria-label={`About ${book}`}
    >
      <div className="insightSheet__inner">
        <p className="insightSheet__eyebrow">{insight.eyebrow}</p>
        <span className="insightSheet__clip">
          <h2 className="insightSheet__title">{book}</h2>
        </span>
        <ul className="insightSheet__facts">
          {insight.facts.map((fact, i) => (
            <li key={i} className="insightSheet__fact" style={{ '--i': i } as CSSProperties}>
              {fact}
            </li>
          ))}
        </ul>
        <button ref={go} type="button" className="btn btn--primary insightSheet__go" onClick={onBegin}>
          <span className="today__goMain">Begin {book}</span>
        </button>
      </div>
    </section>
  );
}

/**
 * Why this chapter matters, above its first verse.
 *
 * Not modal and not dismissable, because it is part of the page: a study Bible
 * puts this in the margin and so does this. `reveal` rises the lines in once;
 * `static` is the same card simply present, for every open after the first.
 */
export function ChapterNoteCard({ note, mode }: { note: Note; mode: NoteMode }) {
  if (mode === 'none') return null;
  return (
    <aside
      className="chapterNote"
      data-reveal={mode === 'reveal' && !reducedMotion() ? '' : undefined}
      aria-label="About this chapter"
    >
      <p className="chapterNote__eyebrow">Why this chapter matters</p>
      <p className="chapterNote__title">{note.title}</p>
      <p className="chapterNote__text">{note.note}</p>
    </aside>
  );
}

/** The way back to a book's card once it has stepped aside. */
export function AboutPill({ book, onOpen }: { book: string; onOpen: () => void }) {
  return (
    <button type="button" className="aboutPill" onClick={onOpen}>
      About {book}
    </button>
  );
}

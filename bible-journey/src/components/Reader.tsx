import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChapterRef } from '../data/plans';
import { TRANSLATION_NAME, cachedBook, loadBook, type BookText } from '../lib/bible';
import { chapterKey } from '../lib/storage';
import { useStore } from '../state/useStore';
import { LogDayPicker } from './LogDayPicker';
import { Check, Chevron } from './icons';

/**
 * The reader. Until this existed you tracked your reading in Bibley and did the
 * reading somewhere else, which made the app a logbook for a habit it did not
 * host.
 *
 * Chapters move in plan order rather than plain book order, so reading straight
 * through walks the plan, and the end of a book leads into whatever the plan
 * says comes next.
 */
export function Reader({
  book,
  chapter,
  onNavigate,
  onClose,
}: {
  book: string;
  chapter: number;
  onNavigate: (book: string, chapter: number) => void;
  onClose: () => void;
}) {
  const { data, derived, toggleChapter } = useStore();
  const { plan } = derived;
  const [text, setText] = useState<BookText | undefined>(() => cachedBook(book));
  const [error, setError] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const key = chapterKey(book, chapter);
  const isRead = key in data.read;

  const { previous, next } = useMemo(() => {
    const at = plan.sequence.findIndex((r) => r.book === book && r.chapter === chapter);
    const pick = (i: number): ChapterRef | undefined =>
      i >= 0 && i < plan.sequence.length ? plan.sequence[i] : undefined;
    // A chapter outside the current plan still reads, it just has no neighbours.
    return at === -1
      ? { previous: undefined, next: undefined }
      : { previous: pick(at - 1), next: pick(at + 1) };
  }, [plan, book, chapter]);

  useEffect(() => {
    let live = true;
    const hit = cachedBook(book);
    if (hit) {
      setText(hit);
      setError(null);
      return;
    }
    setText(undefined);
    setError(null);
    loadBook(book)
      .then((loaded) => live && setText(loaded))
      .catch(() => {
        if (!live) return;
        setError(
          'That book has not been downloaded yet, and there is no connection to fetch it. Anything you have already opened still works offline.',
        );
      });
    return () => {
      live = false;
    };
  }, [book]);

  // A new chapter starts at the top, the way turning a page does.
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
  }, [book, chapter]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && previous) onNavigate(previous.book, previous.chapter);
      if (e.key === 'ArrowRight' && next) onNavigate(next.book, next.chapter);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, onNavigate, previous, next]);

  // The page behind must not scroll while a full-screen sheet is open.
  useEffect(() => {
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
    };
  }, []);

  const chapterCount = text?.chapters.length ?? 0;
  const verses = text?.chapters[chapter - 1];

  return (
    <div className="reader" role="dialog" aria-modal="true" aria-label={`${book} ${chapter}`}>
      <header className="reader__bar">
        <button type="button" className="reader__close" onClick={onClose} aria-label="Close reader">
          ✕
        </button>

        <div className="reader__ref">
          <span className="reader__book">{book}</span>
          {chapterCount > 0 && (
            <select
              className="select reader__chapter"
              value={chapter}
              aria-label="Chapter"
              onChange={(e) => onNavigate(book, Number(e.target.value))}
            >
              {Array.from({ length: chapterCount }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {i + 1}
                </option>
              ))}
            </select>
          )}
        </div>

        {isRead && (
          <span className="reader__done" title="Marked as read">
            <Check size={14} />
          </span>
        )}
      </header>

      <div className="reader__body" ref={bodyRef}>
        {error ? (
          <p className="reader__message">{error}</p>
        ) : !verses ? (
          <p className="reader__message reader__message--quiet">Opening {book}…</p>
        ) : (
          <article className="reader__text">
            <h2 className="reader__heading">
              {book} {chapter}
            </h2>
            {verses.map((verse, i) =>
              // A null verse is a number this translation's source text has
              // nothing behind. Printed Bibles pass over it in silence too.
              verse === null ? null : (
                <p className="verse" key={i}>
                  <span className="verse__n" aria-hidden="true">
                    {i + 1}
                  </span>
                  {verse}
                </p>
              ),
            )}
            <p className="reader__credit">{TRANSLATION_NAME}, public domain</p>
          </article>
        )}
      </div>

      <footer className="reader__foot">
        <div className="reader__log">
          <LogDayPicker id={`reader-log-${chapterKey(book, chapter)}`} />
        </div>

        <div className="reader__actions">
          <button
            type="button"
            className="btn btn--sm"
            disabled={!previous}
            onClick={() => previous && onNavigate(previous.book, previous.chapter)}
          >
            <Chevron size={14} className="reader__back" />
            Back
          </button>

          <button
            type="button"
            className={`btn btn--sm${isRead ? ' btn--ghost' : ' btn--primary'}`}
            onClick={() => toggleChapter(book, chapter)}
          >
            {isRead ? 'Read, undo' : 'Mark as read'}
          </button>

          <button
            type="button"
            className="btn btn--sm"
            disabled={!next}
            onClick={() => next && onNavigate(next.book, next.chapter)}
          >
            Next
            <Chevron size={14} />
          </button>
        </div>
      </footer>
    </div>
  );
}

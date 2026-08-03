import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NEW_TESTAMENT, OLD_TESTAMENT } from '../data/canon';
import { TRANSLATION_NAME, cachedBook, loadBook, type BookText } from '../lib/bible';
import {
  highlightsFor,
  isEmptyRange,
  offsetWithin,
  order,
  segmentVerse,
  verseRootOf,
  type Range,
} from '../lib/highlight';
import { neighbours } from '../lib/navigate';
import { chapterKey, newId, type Highlight } from '../lib/storage';
import { useStore } from '../state/useStore';
import { HighlightSheet } from './HighlightSheet';
import { LogDayPicker } from './LogDayPicker';
import { Check, Chevron } from './icons';

/**
 * The reader. Until this existed you tracked your reading in Bibley and did the
 * reading somewhere else, which made the app a logbook for a habit it did not
 * host.
 *
 * Chapters move in plan order where the plan has an opinion, so reading straight
 * through walks the plan. Anywhere else, and anywhere the reader has wandered off
 * to on their own, printed order takes over.
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
  const { data, derived, toggleChapter, addHighlight } = useStore();
  const { plan } = derived;
  const [text, setText] = useState<BookText | undefined>(() => cachedBook(book));
  const [error, setError] = useState<string | null>(null);
  /** The highlight whose note is open, or a pending range not yet saved. */
  const [editing, setEditing] = useState<string | null>(null);
  const [pending, setPending] = useState<Range | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLElement>(null);

  const key = chapterKey(book, chapter);
  const isRead = key in data.read;
  const marks = useMemo(
    () => highlightsFor(data.highlights, book, chapter),
    [data.highlights, book, chapter],
  );

  const { previous, next } = useMemo(
    () => neighbours(book, chapter, plan),
    [book, chapter, plan],
  );

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
    setPending(null);
    setEditing(null);
  }, [book, chapter]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (editing || pending) {
          setEditing(null);
          setPending(null);
        } else onClose();
        return;
      }
      // Arrow keys would fight a text selection, so they stay out of the way.
      if (editing || pending) return;
      if (e.key === 'ArrowLeft' && previous) onNavigate(previous.book, previous.chapter);
      if (e.key === 'ArrowRight' && next) onNavigate(next.book, next.chapter);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, onNavigate, previous, next, editing, pending]);

  // The page behind must not scroll while a full-screen sheet is open.
  useEffect(() => {
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
    };
  }, []);

  /** Turns whatever the reader dragged over into verse and character offsets. */
  const readSelection = useCallback((): Range | null => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;

    const root = textRef.current;
    if (!root) return null;

    const startVerse = verseRootOf(selection.anchorNode);
    const endVerse = verseRootOf(selection.focusNode);
    if (!startVerse || !endVerse || !root.contains(startVerse) || !root.contains(endVerse)) {
      return null;
    }

    const range = order(
      {
        verse: Number(startVerse.dataset.verse),
        offset: offsetWithin(startVerse, selection.anchorNode!, selection.anchorOffset),
      },
      {
        verse: Number(endVerse.dataset.verse),
        offset: offsetWithin(endVerse, selection.focusNode!, selection.focusOffset),
      },
    );

    return isEmptyRange(range) ? null : range;
  }, []);

  const onSelectionEnd = useCallback(() => {
    const range = readSelection();
    if (range) {
      setPending(range);
      setEditing(null);
    }
  }, [readSelection]);

  /*
   * A phone does not end a long-press selection with a tidy touchend, and
   * dragging the selection handles afterwards fires nothing at all. Watching for
   * the selection to settle is what makes this work with a thumb rather than
   * only with a mouse.
   */
  useEffect(() => {
    let timer = 0;
    const onChange = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(onSelectionEnd, 400);
    };
    document.addEventListener('selectionchange', onChange);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('selectionchange', onChange);
    };
  }, [onSelectionEnd]);

  /** The selected words, stitched across verses. Used for the preview and the save. */
  const quoteFor = useCallback(
    (range: Range): string => {
      if (!text) return '';
      const parts: string[] = [];
      for (let v = range.from.verse; v <= range.to.verse; v++) {
        const verse = text.chapters[chapter - 1]?.[v - 1];
        if (!verse) continue;
        const start = v === range.from.verse ? range.from.offset : 0;
        const end = v === range.to.verse ? range.to.offset : verse.length;
        parts.push(verse.slice(start, end).trim());
      }
      return parts.filter(Boolean).join(' ');
    },
    [text, chapter],
  );

  const commitPending = useCallback(
    (note: string) => {
      if (!pending || !text) return;
      const now = new Date().toISOString();
      const highlight: Highlight = {
        id: newId(),
        book,
        chapter,
        from: pending.from,
        to: pending.to,
        text: quoteFor(pending),
        note: note.trim() || undefined,
        createdAt: now,
        updatedAt: now,
      };
      addHighlight(highlight);
      setPending(null);
      window.getSelection()?.removeAllRanges();
    },
    [pending, text, book, chapter, addHighlight, quoteFor],
  );

  const chapterCount = text?.chapters.length ?? 0;
  const verses = text?.chapters[chapter - 1];
  const open = marks.find((h) => h.id === editing);

  return (
    <div className="reader" role="dialog" aria-modal="true" aria-label={`${book} ${chapter}`}>
      <header className="reader__bar">
        <button type="button" className="reader__close" onClick={onClose} aria-label="Close reader">
          ✕
        </button>

        <div className="reader__ref">
          {/* Every book, not only the ones in the plan: how you read is yours. */}
          <select
            className="select reader__book"
            value={book}
            aria-label="Book"
            onChange={(e) => onNavigate(e.target.value, 1)}
          >
            <optgroup label="Old Testament">
              {OLD_TESTAMENT.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </optgroup>
            <optgroup label="New Testament">
              {NEW_TESTAMENT.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </optgroup>
          </select>

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
          <article
            className="reader__text"
            ref={textRef}
            onMouseUp={onSelectionEnd}
            onTouchEnd={onSelectionEnd}
          >
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
                  {/*
                    data-verse marks the text and only the text. Put it on the
                    paragraph and the verse number counts as characters, so every
                    highlight lands one place off, or two past verse nine.
                  */}
                  <span className="verse__t" data-verse={i + 1}>
                    {segmentVerse(verse, i + 1, marks).map((segment, s) =>
                      segment.id ? (
                        <mark
                          key={s}
                          className={`hl${segment.note ? ' hl--noted' : ''}`}
                          // Reading is the default, so opening a note is a tap
                          // rather than something a stray drag can trigger.
                          onClick={() => {
                            setPending(null);
                            setEditing(segment.id!);
                          }}
                        >
                          {segment.text}
                        </mark>
                      ) : (
                        <span key={s}>{segment.text}</span>
                      ),
                    )}
                  </span>
                </p>
              ),
            )}
            <p className="reader__credit">{TRANSLATION_NAME}, public domain</p>
          </article>
        )}
      </div>

      {(pending || open) && (
        <HighlightSheet
          highlight={open}
          pendingText={pending ? quoteFor(pending) : ''}
          onSave={commitPending}
          onClose={() => {
            setPending(null);
            setEditing(null);
          }}
        />
      )}

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

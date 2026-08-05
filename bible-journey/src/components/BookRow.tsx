import { useEffect, useMemo, useRef, useState } from 'react';
import { relativeDay, today } from '../lib/dates';
import { plural } from '../lib/format';
import { readChapter } from '../lib/navigate';
import { chapterKey } from '../lib/storage';
import { useReader } from '../state/useReader';
import { useStore } from '../state/useStore';
import { LogDayPicker } from './LogDayPicker';
import { NoteEditor } from './NoteEditor';
import { ProgressBar } from './ProgressBar';
import { Check, Chevron } from './icons';

type Props = {
  name: string;
  chapters: number;
  read: number;
  open: boolean;
  onToggle: () => void;
};

/**
 * Say which chapters you read, from one number to another, and on what day.
 *
 * Earlier versions asked you to hit the chapters themselves: a grid of small
 * squares to tap, then to drag across, then to double tap at each end. Every one
 * of them was a fiddly target on a phone, and every one shifted the layout under
 * your thumb as controls appeared. Two number fields cannot miss, cannot move,
 * and say exactly what they mean. The squares stay, but only as a picture of
 * where you have got to.
 */
export function BookRow({ name, chapters, read, open, onToggle }: Props) {
  const { data, markChapters, clearChapters, clearBook, logDay } = useStore();
  const { open: openReader } = useReader();
  const ref = useRef<HTMLDivElement>(null);
  const done = read === chapters;
  const notes = data.notes.filter((n) => n.book === name);

  /** Highest chapter with an unbroken run of reads behind it. */
  const contiguous = useMemo(() => {
    let n = 0;
    while (n < chapters && chapterKey(name, n + 1) in data.read) n++;
    return n;
  }, [data.read, name, chapters]);

  /** Where a reader coming back would start: the first chapter they have not read. */
  const nextUp = Math.min(chapters, contiguous + 1);
  /*
   * Held as text, not numbers. A field being empty is what a field looks like
   * halfway through being retyped, and turning that into a number on every
   * keystroke is why the digit could not be deleted: it refilled itself.
   */
  const [fromText, setFromText] = useState(String(nextUp));
  const [toText, setToText] = useState(String(nextUp));
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    if (open) {
      ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      setFromText(String(nextUp));
      setToText(String(nextUp));
    } else setConfirmClear(false);
    // Only when the row opens: re-running on every mark would yank the fields
    // out from under someone entering a second range.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const isRead = (c: number) => chapterKey(name, c) in data.read;
  const from = readChapter(fromText, chapters, nextUp);
  const to = readChapter(toText, chapters, from);

  // Taken in whichever order they were typed, so neither field has to be first.
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  const chosen = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
  const chosenRead = chosen.filter(isRead);
  const panelId = `book-panel-${name.replace(/\s+/g, '-')}`;

  const setRange = (a: number, b: number) => {
    setFromText(String(a));
    setToText(String(b));
  };

  /** Digits only, so a stray letter never lands in a chapter number. */
  const onlyDigits = (value: string) => value.replace(/\D/g, '').slice(0, 3);

  return (
    <div className={`book${done ? ' book--done' : ''}`} ref={ref} data-book={name}>
      <button
        type="button"
        className="book__row"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
      >
        <span className="book__name">
          {done && <Check size={15} className="book__check" />}
          <span>{name}</span>
          {notes.length > 0 && (
            <span className="book__noteDot" title={`${notes.length} note(s)`} aria-hidden="true" />
          )}
        </span>
        <ProgressBar
          value={read}
          max={chapters}
          label={`${name} progress`}
          thin
          className="book__bar"
        />
        <span className="book__count">
          {read}/{chapters}
        </span>
        <Chevron size={15} className={`book__chev${open ? ' book__chev--open' : ''}`} />
      </button>

      {open && (
        <div className="book__panel" id={panelId}>
          <div className="range">
            <span className="range__field">
              <label htmlFor={`${panelId}-from`}>I read chapters</label>
              <input
                id={`${panelId}-from`}
                className="field range__input"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                aria-label={`First chapter read, 1 to ${chapters}`}
                value={fromText}
                // Tapping a field you mean to retype should not need the old
                // value deleting first.
                onFocus={(e) => e.target.select()}
                onChange={(e) => setFromText(onlyDigits(e.target.value))}
                // Clamping waits for blur, so an empty or out of range field is
                // allowed to exist for as long as it is being typed into.
                onBlur={() => setFromText(String(from))}
              />
            </span>
            <span className="range__field">
              <label htmlFor={`${panelId}-to`}>to</label>
              <input
                id={`${panelId}-to`}
                className="field range__input"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                aria-label={`Last chapter read, 1 to ${chapters}`}
                value={toText}
                onFocus={(e) => e.target.select()}
                onChange={(e) => setToText(onlyDigits(e.target.value))}
                onBlur={() => setToText(String(to))}
              />
            </span>
            <span className="range__count">{plural(chosen.length, 'chapter')}</span>
          </div>

          <div className="range__quick">
            <button type="button" className="chipBtn" onClick={() => setRange(nextUp, nextUp)}>
              Just the next
            </button>
            <button type="button" className="chipBtn" onClick={() => setRange(nextUp, chapters)}>
              Rest of the book
            </button>
            <button type="button" className="chipBtn" onClick={() => setRange(1, chapters)}>
              Whole book
            </button>
          </div>

          {/*
            Always here rather than appearing with a selection, so nothing below
            it ever jumps while you are reaching for it.
          */}
          <div className="commit">
            <LogDayPicker id={`${panelId}-log-day`} />
            <div className="commit__actions">
              <button
                type="button"
                className="btn btn--sm btn--primary"
                onClick={() => markChapters(name, chosen)}
              >
                {/*
                  The date carries over between books, which is what you want
                  when filling in a week you read on paper. So the button names
                  the day it is about to record.
                */}
                Mark {chosen.length} read
                {logDay && logDay !== today() ? ` on ${relativeDay(logDay)}` : ''}
              </button>
              {chosenRead.length > 0 && (
                <button
                  type="button"
                  className="btn btn--sm btn--ghost"
                  onClick={() => clearChapters(name, chosenRead)}
                >
                  Unmark {chosenRead.length}
                </button>
              )}
            </div>
          </div>

          {/*
            A picture, not a control. Nothing here is tappable, which is the
            whole point: it can be small enough to show Psalms at a glance
            without anyone having to hit it.
          */}
          <div
            className="strip"
            role="img"
            aria-label={`${read} of ${chapters} chapters read`}
          >
            {Array.from({ length: chapters }, (_, i) => i + 1).map((c) => (
              <span
                key={c}
                className={`strip__ch${isRead(c) ? ' strip__ch--read' : ''}${
                  c >= lo && c <= hi ? ' strip__ch--inRange' : ''
                }`}
                title={`${name} ${c}${isRead(c) ? ', read' : ''}`}
              />
            ))}
          </div>

          <div className="bookTools">
            <button
              type="button"
              className="btn btn--sm btn--primary"
              onClick={() => openReader(name, nextUp)}
            >
              Read
            </button>
            <span className="bookTools__spacer" />
            {confirmClear ? (
              <>
                <button
                  type="button"
                  className="btn btn--sm btn--danger"
                  onClick={() => {
                    clearBook(name, chapters);
                    setConfirmClear(false);
                  }}
                >
                  Clear all {read}?
                </button>
                <button
                  type="button"
                  className="btn btn--sm btn--ghost"
                  onClick={() => setConfirmClear(false)}
                >
                  Keep
                </button>
              </>
            ) : (
              <button
                type="button"
                className="btn btn--sm btn--ghost"
                onClick={() => setConfirmClear(true)}
                disabled={read === 0}
              >
                Clear book
              </button>
            )}
          </div>

          <NoteEditor book={name} chapters={chapters} />
        </div>
      )}
    </div>
  );
}

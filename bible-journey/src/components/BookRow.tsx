import { useEffect, useMemo, useRef, useState } from 'react';
import { relativeDay, today } from '../lib/dates';
import { interpretTap, type LastTap } from '../lib/tapSelect';
import { plural } from '../lib/format';
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
 * Chapters are chosen first and committed second.
 *
 * Tapping used to mark a chapter there and then, against whatever date a picker
 * elsewhere happened to be set to. That made the date a mode you had to
 * remember, and gave no moment where you could see what you were about to
 * record. Now a tap only selects, the selection is plainly a third state next to
 * read and unread, and the date sits on the button that commits it.
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

  const [picked, setPicked] = useState<ReadonlySet<number>>(new Set());
  const [confirmClear, setConfirmClear] = useState(false);
  /** One end of a range, waiting for the other. Set by a double tap. */
  const [anchor, setAnchor] = useState<number | null>(null);
  const lastTap = useRef<LastTap>(null);

  useEffect(() => {
    if (open) ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    else {
      setConfirmClear(false);
      // Closing a book abandons the selection: a choice left lying around in a
      // collapsed row is the same hidden state this replaced.
      setPicked(new Set());
      setAnchor(null);
    }
  }, [open]);

  const isRead = (c: number) => chapterKey(name, c) in data.read;
  const all = Array.from({ length: chapters }, (_, i) => i + 1);
  const chosen = [...picked].sort((a, b) => a - b);
  const chosenRead = chosen.filter(isRead);

  const select = (list: number[]) => {
    setPicked(new Set(list));
    setAnchor(null);
  };

  /**
   * A first double tap remembers one end of a run, a second takes everything
   * between. The tap that opens a double tap has already toggled the chapter,
   * which is why the anchor only has to make sure it stays selected.
   */
  const onTap = (c: number) => {
    const now = Date.now();
    const action = interpretTap(c, lastTap.current, anchor, now);
    lastTap.current = action.kind === 'toggle' ? { chapter: c, at: now } : null;

    if (action.kind === 'toggle') {
      setPicked((prev) => {
        const next = new Set(prev);
        if (next.has(c)) next.delete(c);
        else next.add(c);
        return next;
      });
      return;
    }

    if (action.kind === 'anchor') {
      setPicked((prev) => new Set(prev).add(c));
      setAnchor(c);
      return;
    }

    setPicked((prev) => {
      const next = new Set(prev);
      for (const n of action.chapters) next.add(n);
      return next;
    });
    setAnchor(null);
  };

  const panelId = `book-panel-${name.replace(/\s+/g, '-')}`;
  const unread = all.filter((c) => !isRead(c));

  return (
    <div className={`book${done ? " book--done" : ""}`} ref={ref} data-book={name}>
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
          <div className="pickBar">
            <span className={`pickBar__hint${anchor !== null ? ' pickBar__hint--waiting' : ''}`}>
              {anchor !== null
                ? `Double tap where you finished, to take ${anchor} onwards`
                : chosen.length === 0
                  ? 'Tap to choose. Double tap two chapters for everything between'
                  : plural(chosen.length, 'chapter selected', 'chapters selected')}
            </span>
            <div className="pickBar__quick">
              <button type="button" className="chipBtn" onClick={() => select(unread)}>
                All unread
              </button>
              <button type="button" className="chipBtn" onClick={() => select(all)}>
                Whole book
              </button>
              {/*
                Replaces the old "read through chapter N" slider in two taps
                instead of a drag: choose the chapter you finished on, then say
                you read everything up to it.
              */}
              {chosen.length === 1 && chosen[0] > 1 && (
                <button
                  type="button"
                  className="chipBtn"
                  onClick={() => select(all.slice(0, chosen[0]))}
                >
                  Everything up to {chosen[0]}
                </button>
              )}
              {chosen.length > 0 && (
                <button type="button" className="chipBtn" onClick={() => select([])}>
                  None
                </button>
              )}
            </div>
          </div>

          <div className="chapters">
            {all.map((c) => {
              const readNow = isRead(c);
              const chosenNow = picked.has(c);
              const anchored = anchor === c;
              return (
                <button
                  key={c}
                  type="button"
                  data-chapter={c}
                  className={`chapter${readNow ? ' chapter--read' : ''}${
                    chosenNow ? ' chapter--picked' : ''
                  }${anchored ? ' chapter--anchor' : ''}`}
                  // The button toggles selection, so that is what pressed means.
                  // Whether it has been read is said in the label instead.
                  aria-pressed={chosenNow}
                  aria-label={`${name} chapter ${c}${readNow ? ', read' : ''}${
                    chosenNow ? ', selected' : ''
                  }${anchored ? ', start of range' : ''}`}
                  onClick={() => onTap(c)}
                >
                  {c}
                </button>
              );
            })}
          </div>

          {chosen.length > 0 && (
            // The date lives on the thing that commits, so what you are about to
            // record is on screen at the moment you record it.
            <div className="commit">
              <LogDayPicker id={`${panelId}-log-day`} />
              <div className="commit__actions">
                <button
                  type="button"
                  className="btn btn--sm btn--primary"
                  onClick={() => {
                    markChapters(name, chosen);
                    setPicked(new Set());
                  }}
                >
                  {/*
                    The date carries over between selections, which is what you
                    want when filling in a week you read on paper. So the button
                    names the day it is about to record, and a wrong one is
                    impossible to press without reading it first.
                  */}
                  Mark {chosen.length} read{logDay && logDay !== today() ? ` on ${relativeDay(logDay)}` : ''}
                </button>
                {chosenRead.length > 0 && (
                  <button
                    type="button"
                    className="btn btn--sm btn--ghost"
                    onClick={() => {
                      clearChapters(name, chosenRead);
                      setPicked(new Set());
                    }}
                  >
                    Unmark {chosenRead.length}
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="bookTools">
            <button
              type="button"
              className="btn btn--sm btn--primary"
              // Wherever you left off, not chapter one, since that is where a
              // reader coming back actually wants to be.
              onClick={() => openReader(name, Math.min(chapters, contiguous + 1))}
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

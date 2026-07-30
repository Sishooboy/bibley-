import { useEffect, useMemo, useRef, useState } from 'react';
import { today } from '../lib/dates';
import { chapterKey } from '../lib/storage';
import { useStore } from '../state/useStore';
import { NoteEditor } from './NoteEditor';
import { ProgressBar } from './ProgressBar';
import { Check, Chevron } from './icons';

type Props = {
  name: string;
  chapters: number;
  read: number;
  open: boolean;
  onToggle: () => void;
  /** John: read before the journal existed, so its chapters aren't editable. */
  seeded?: boolean;
};

export function BookRow({ name, chapters, read, open, onToggle, seeded }: Props) {
  const { data, toggleChapter, markThrough, clearBook } = useStore();
  const ref = useRef<HTMLDivElement>(null);
  const done = read === chapters;
  const todayKey = today();
  const notes = data.notes.filter((n) => n.book === name);

  /** Highest chapter with an unbroken run of reads behind it. */
  const contiguous = useMemo(() => {
    let n = 0;
    while (n < chapters && chapterKey(name, n + 1) in data.read) n++;
    return n;
  }, [data.read, name, chapters]);

  const [target, setTarget] = useState(contiguous);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    setTarget(contiguous);
  }, [contiguous]);

  useEffect(() => {
    if (open) ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    else setConfirmClear(false);
  }, [open]);

  const all = Array.from({ length: chapters }, (_, i) => i + 1);
  const panelId = `book-panel-${name.replace(/\s+/g, '-')}`;
  const pending = Math.max(0, target - contiguous);

  return (
    <div className={`book${done ? ' book--done' : ''}`} ref={ref}>
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
          {!seeded && (
            <div className="readTo">
              <div className="readTo__head">
                <label className="eyebrow" htmlFor={`${panelId}-slider`}>
                  Read through chapter
                </label>
                <output className="readTo__value" htmlFor={`${panelId}-slider`}>
                  {target}
                </output>
              </div>

              <div className="readTo__controls">
                <button
                  type="button"
                  className="readTo__step"
                  onClick={() => setTarget((t) => Math.max(0, t - 1))}
                  disabled={target === 0}
                  aria-label="One chapter back"
                >
                  −
                </button>
                <input
                  id={`${panelId}-slider`}
                  className="readTo__slider"
                  type="range"
                  min={0}
                  max={chapters}
                  value={target}
                  onChange={(e) => setTarget(Number(e.target.value))}
                />
                <button
                  type="button"
                  className="readTo__step"
                  onClick={() => setTarget((t) => Math.min(chapters, t + 1))}
                  disabled={target === chapters}
                  aria-label="One chapter forward"
                >
                  +
                </button>
              </div>

              <div className="readTo__actions">
                <button
                  type="button"
                  className="btn btn--sm btn--primary"
                  disabled={pending === 0}
                  onClick={() => markThrough(name, target)}
                >
                  {pending === 0
                    ? 'Nothing new to mark'
                    : `Mark ${pending} chapter${pending === 1 ? '' : 's'} read`}
                </button>
                <span className="bookTools__spacer" />
                <span className="readTo__hint">
                  {chapters - read} of {chapters} left
                </span>
              </div>
            </div>
          )}

          <div className="chapters">
            {all.map((c) => {
              const key = chapterKey(name, c);
              const isRead = key in data.read;
              const readToday = data.read[key] === todayKey;
              return (
                <button
                  key={c}
                  type="button"
                  className={[
                    'chapter',
                    seeded ? 'chapter--seeded' : '',
                    readToday ? 'chapter--today' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  aria-pressed={isRead}
                  aria-label={`${name} chapter ${c}${isRead ? ', read' : ''}`}
                  disabled={seeded}
                  onClick={() => toggleChapter(name, c)}
                >
                  {c}
                </button>
              );
            })}
          </div>

          {!seeded && (
            <div className="bookTools">
              <button
                type="button"
                className="btn btn--sm"
                onClick={() => markThrough(name, chapters)}
                disabled={done}
              >
                Mark whole book
              </button>
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
                    Clear {read} chapters?
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
                  Clear
                </button>
              )}
            </div>
          )}

          <NoteEditor book={name} chapters={chapters} />
        </div>
      )}
    </div>
  );
}

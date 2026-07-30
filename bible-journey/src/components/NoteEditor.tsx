import { useEffect, useId, useState } from 'react';
import { useStore } from '../state/useStore';

type Props = { book: string; chapters: number };

/**
 * One editor per book, with a target picker, so a note can hang off the book
 * itself or any single chapter without cluttering the chapter grid.
 */
export function NoteEditor({ book, chapters }: Props) {
  const { data, noteFor, saveNote } = useStore();
  const [target, setTarget] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const [saved, setSaved] = useState(false);
  const selectId = useId();
  const areaId = useId();

  const existing = noteFor(book, target);

  useEffect(() => {
    setDraft(existing?.text ?? '');
    setSaved(false);
  }, [existing?.id, existing?.text, book, target]);

  const noted = new Set(
    data.notes.filter((n) => n.book === book && n.chapter !== null).map((n) => n.chapter as number),
  );
  const dirty = draft.trim() !== (existing?.text ?? '');

  function commit() {
    if (!dirty) return;
    saveNote(book, target, draft);
    setSaved(true);
  }

  return (
    <div className="noteEditor">
      <div className="noteEditor__label">
        <label className="eyebrow" htmlFor={selectId}>
          Note on
        </label>
        <select
          id={selectId}
          className="select"
          value={target === null ? 'book' : String(target)}
          onChange={(e) => setTarget(e.target.value === 'book' ? null : Number(e.target.value))}
        >
          <option value="book">{book} (whole book){noteFor(book, null) ? ' •' : ''}</option>
          {Array.from({ length: chapters }, (_, i) => i + 1).map((c) => (
            <option key={c} value={c}>
              Chapter {c}
              {noted.has(c) ? ' •' : ''}
            </option>
          ))}
        </select>
      </div>

      <label className="sr-only" htmlFor={areaId}>
        Note text for {book}
        {target === null ? '' : ` chapter ${target}`}
      </label>
      <textarea
        id={areaId}
        className="field"
        rows={3}
        value={draft}
        placeholder="A verse that stuck, a question, a one-line summary…"
        onChange={(e) => {
          setDraft(e.target.value);
          setSaved(false);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            commit();
          }
        }}
      />

      <div className="bookTools" style={{ marginTop: '0.55rem' }}>
        <button type="button" className="btn btn--sm" onClick={commit} disabled={!dirty}>
          Save note
        </button>
        {existing && (
          <button
            type="button"
            className="btn btn--sm btn--ghost"
            onClick={() => {
              saveNote(book, target, '');
              setDraft('');
            }}
          >
            Delete
          </button>
        )}
        <span className="bookTools__spacer" />
        {dirty ? <span>Unsaved</span> : saved || existing ? <span>Saved</span> : null}
      </div>
    </div>
  );
}

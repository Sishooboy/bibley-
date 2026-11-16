import { useState } from 'react';
import { useStore } from '../state/useStore';

/**
 * A note on the chapter being read, written without leaving the reader.
 *
 * The same note the journey's book panel edits, `noteFor(book, chapter)`, so a
 * thought written here is the one Notes lists and the one that syncs; this is a
 * second door into it, not a second kind of note. It borrows the highlight
 * sheet's frame on purpose: that sheet already sits on top of the keyboard
 * through `--keyboard`, and a box you type into at the foot of a phone screen
 * is exactly what that was built for.
 */
export function ChapterNoteSheet({
  book,
  chapter,
  onClose,
}: {
  book: string;
  chapter: number;
  onClose: () => void;
}) {
  const { noteFor, saveNote } = useStore();
  const existing = noteFor(book, chapter);
  const [draft, setDraft] = useState(existing?.text ?? '');
  const [confirming, setConfirming] = useState(false);
  const dirty = draft.trim() !== (existing?.text ?? '');

  return (
    <div className="hlSheet" role="dialog" aria-label={`Note on ${book} ${chapter}`}>
      <div className="hlSheet__inner">
        <div className="hlSheet__head">
          <span className="hlSheet__ref">
            {existing ? 'Your note on' : 'A note on'} {book} {chapter}
          </span>
          <button type="button" className="hlSheet__close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <textarea
          className="field hlSheet__note"
          rows={5}
          aria-label={`Note on ${book} ${chapter}`}
          placeholder="A verse that stuck, a question, a one-line summary…"
          value={draft}
          /*
           * Straight into typing when there is nothing yet, since that is the
           * only reason to have opened it. An existing note opens to be read,
           * so a phone does not throw a keyboard over it first.
           */
          autoFocus={!existing}
          onChange={(e) => {
            setDraft(e.target.value);
            setConfirming(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && dirty) {
              e.preventDefault();
              saveNote(book, chapter, draft);
              onClose();
            }
          }}
        />

        <div className="hlSheet__actions">
          <button
            type="button"
            className="btn btn--sm btn--primary"
            disabled={!dirty}
            onClick={() => {
              // An emptied box deletes, the same rule the book panel follows,
              // so it writes the tombstone a sync needs rather than an empty note.
              saveNote(book, chapter, draft);
              onClose();
            }}
          >
            Save
          </button>
          {existing &&
            (confirming ? (
              <>
                <button
                  type="button"
                  className="btn btn--sm btn--danger"
                  onClick={() => {
                    saveNote(book, chapter, '');
                    onClose();
                  }}
                >
                  Delete it
                </button>
                <button type="button" className="btn btn--sm btn--ghost" onClick={() => setConfirming(false)}>
                  Keep
                </button>
              </>
            ) : (
              <button type="button" className="btn btn--sm btn--ghost" onClick={() => setConfirming(true)}>
                Delete
              </button>
            ))}
          <button type="button" className="btn btn--sm btn--ghost" onClick={onClose}>
            {dirty ? 'Discard' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
}

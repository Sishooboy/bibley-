import { useEffect, useState } from 'react';
import { useStore } from '../state/useStore';
import { Cross } from './Ornament';

const VISIBLE_MS = 9000;

/** Catches the mistaps: any bulk change can be walked back for a few seconds. */
export function UndoBar() {
  const { undoable, undo } = useStore();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!undoable) return;
    setDismissed(false);
    const timer = setTimeout(() => setDismissed(true), VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [undoable]);

  if (!undoable || dismissed) return null;

  return (
    <div className={`undoBar${undoable.tone === 'done' ? ' undoBar--done' : ''}`} role="status">
      {/* Finishing a book is the only milestone between one chapter and the
          whole Bible, and this bar is already on screen when it happens. */}
      {undoable.tone === 'done' && <Cross size={15} className="undoBar__cross" />}
      <span className="undoBar__label">{undoable.label}</span>
      <button
        type="button"
        className="undoBar__action"
        onClick={() => {
          undo();
          setDismissed(true);
        }}
      >
        Undo
      </button>
      <button
        type="button"
        className="undoBar__close"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}

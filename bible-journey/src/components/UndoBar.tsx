import { useEffect, useState } from 'react';
import { useStore } from '../state/useStore';

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
    <div className="undoBar" role="status">
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

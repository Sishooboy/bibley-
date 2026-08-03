import { useEffect, useRef, useState } from 'react';
import { highlightRef } from '../lib/highlight';
import type { Highlight } from '../lib/storage';
import { useStore } from '../state/useStore';

/**
 * The panel that turns a selection into something you keep.
 *
 * It handles both halves of the same idea: a passage just selected and not yet
 * saved, and a saved one being revisited. Highlighting without writing anything
 * is a first-class outcome, so Save is reachable with the box left empty.
 */
export function HighlightSheet({
  highlight,
  pendingText,
  onSave,
  onClose,
}: {
  /** Set when revisiting a saved highlight, absent when one is being made. */
  highlight?: Highlight;
  pendingText: string;
  onSave: (note: string) => void;
  onClose: () => void;
}) {
  const { noteHighlight, removeHighlight } = useStore();
  const [draft, setDraft] = useState(highlight?.note ?? '');
  const [confirming, setConfirming] = useState(false);
  const boxRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setDraft(highlight?.note ?? '');
    setConfirming(false);
  }, [highlight]);

  const quote = highlight?.text ?? pendingText;

  return (
    <div className="hlSheet" role="dialog" aria-label="Highlight">
      <div className="hlSheet__inner">
        <div className="hlSheet__head">
          <span className="hlSheet__ref">
            {highlight ? highlightRef(highlight) : 'New highlight'}
          </span>
          <button
            type="button"
            className="hlSheet__close"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <blockquote className="hlSheet__quote">{quote}</blockquote>

        <textarea
          ref={boxRef}
          className="field hlSheet__note"
          rows={3}
          placeholder="What did you make of it? Optional."
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />

        <div className="hlSheet__actions">
          {highlight ? (
            <>
              <button
                type="button"
                className="btn btn--sm btn--primary"
                onClick={() => {
                  noteHighlight(highlight.id, draft);
                  onClose();
                }}
              >
                Save
              </button>
              {confirming ? (
                <>
                  <button
                    type="button"
                    className="btn btn--sm btn--danger"
                    onClick={() => {
                      removeHighlight(highlight.id);
                      onClose();
                    }}
                  >
                    Remove it
                  </button>
                  <button
                    type="button"
                    className="btn btn--sm btn--ghost"
                    onClick={() => setConfirming(false)}
                  >
                    Keep
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="btn btn--sm btn--ghost"
                  onClick={() => setConfirming(true)}
                >
                  Remove
                </button>
              )}
            </>
          ) : (
            <>
              <button
                type="button"
                className="btn btn--sm btn--primary"
                onClick={() => onSave(draft)}
              >
                {draft.trim() ? 'Highlight and save note' : 'Highlight'}
              </button>
              <button type="button" className="btn btn--sm btn--ghost" onClick={onClose}>
                Cancel
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

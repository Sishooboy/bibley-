import { useEffect, useRef, useState } from 'react';
import { SendVerse, type Sendable } from './SendVerse';
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
  sendable,
  onSave,
  onClose,
}: {
  /** Set when revisiting a saved highlight, absent when one is being made. */
  highlight?: Highlight;
  pendingText: string;
  /**
   * Where this passage sits, for handing it to somebody. Supplied for a
   * selection being made as well as for a saved one, so passing a verse on does
   * not mean saving it, closing the sheet and opening it again.
   */
  sendable?: Sendable;
  onSave: (note: string) => void;
  onClose: () => void;
}) {
  const { noteHighlight, removeHighlight } = useStore();
  const [draft, setDraft] = useState(highlight?.note ?? '');
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState<'send' | 'post' | null>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setDraft(highlight?.note ?? '');
    setConfirming(false);
    setSending(null);
  }, [highlight]);

  const quote = highlight?.text ?? pendingText;

  /*
   * Sending takes over the whole sheet rather than unfolding inside it. The
   * sheet already lifts itself above the keyboard and a picker plus a second
   * box underneath the note would put the send button back under the keys on a
   * phone, which is the exact problem `useKeyboardInset` exists to solve.
   */
  if (sending && sendable) {
    return (
      <div className="hlSheet" role="dialog" aria-label="Send this passage">
        <div className="hlSheet__inner">
          <div className="hlSheet__head">
            <span className="hlSheet__ref">
              {highlight ? highlightRef(highlight) : 'New highlight'}
            </span>
            <button type="button" className="hlSheet__close" onClick={onClose} aria-label="Close">
              ✕
            </button>
          </div>
          <SendVerse
            sendable={sendable}
            quote={quote}
            mode={sending}
            onClose={() => setSending(null)}
          />
        </div>
      </div>
    );
  }

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
          /*
           * The sheet lifts itself above the keyboard, but a long passage can
           * still leave the box below the fold inside it. The wait is for the
           * keyboard to finish opening: measure before that and it scrolls to
           * where the box was rather than where it is about to be.
           */
          onFocus={() => {
            window.setTimeout(() => boxRef.current?.scrollIntoView({ block: 'nearest' }), 300);
          }}
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
          {sendable && (
            <>
              <button
                type="button"
                className="btn btn--sm btn--ghost"
                onClick={() => setSending('send')}
              >
                Send to a friend
              </button>
              {/*
                Posting is deliberately next to sending rather than on the
                friends screen. This is where you are when a verse strikes you,
                and a picker on another screen would mean remembering the
                reference and going to look it up again.
              */}
              <button
                type="button"
                className="btn btn--sm btn--ghost"
                onClick={() => setSending('post')}
              >
                Put it up for today
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

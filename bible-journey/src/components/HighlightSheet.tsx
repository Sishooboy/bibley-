import { useEffect, useRef, useState } from 'react';
import { SendVerse, type Sendable } from './SendVerse';
import { HIGHLIGHT_COLOURS, type HighlightColour } from '../lib/colours';
import { colourOf, highlightRef } from '../lib/highlight';
import { lastHighlightColour, setLastHighlightColour } from '../lib/prefs';
import type { Highlight } from '../lib/storage';
import { useStore } from '../state/useStore';

/** What each colour is called, for the one reader who cannot see which is which. */
const COLOUR_NAMES: Record<HighlightColour, string> = {
  gold: 'Gold',
  blue: 'Blue',
  green: 'Green',
};

/**
 * Three small squares, one a colour.
 *
 * A radio group, because exactly one is always chosen and a highlight is never
 * colourless: absent already means gold. Each square is drawn small and hit
 * large, a 24px swatch inside a 40px button, since "little squares" is right
 * for the eye and wrong for a thumb.
 */
function Swatches({
  value,
  onPick,
}: {
  value: HighlightColour;
  onPick: (colour: HighlightColour) => void;
}) {
  return (
    <div className="swatches" role="radiogroup" aria-label="Highlight colour">
      {HIGHLIGHT_COLOURS.map((colour) => (
        <button
          key={colour}
          type="button"
          role="radio"
          aria-checked={value === colour}
          aria-label={COLOUR_NAMES[colour]}
          title={COLOUR_NAMES[colour]}
          className={`swatch${value === colour ? ' swatch--on' : ''}`}
          data-colour={colour}
          onClick={() => onPick(colour)}
        />
      ))}
    </div>
  );
}

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
  onSave: (note: string, colour: HighlightColour) => void;
  onClose: () => void;
}) {
  const { noteHighlight, removeHighlight, colourHighlight } = useStore();
  const [draft, setDraft] = useState(highlight?.note ?? '');
  /*
   * A saved highlight shows its own colour. A new one starts as whichever was
   * picked last on this device, so marking a run of verses in the same colour
   * does not cost a tap each.
   */
  const [colour, setColour] = useState<HighlightColour>(() =>
    highlight ? colourOf(highlight) : lastHighlightColour(),
  );
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState<'send' | 'post' | null>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setDraft(highlight?.note ?? '');
    setColour(highlight ? colourOf(highlight) : lastHighlightColour());
    setConfirming(false);
    setSending(null);
  }, [highlight]);

  /*
   * A saved highlight changes colour the moment a square is tapped, not on
   * Save. The mark is visible behind the sheet, so the change is seen as it is
   * made, and closing with the cross should not quietly throw it away the way
   * it would an unsaved note. A new highlight only remembers the choice, since
   * there is nothing on the page to recolour until it is made.
   */
  const pick = (next: HighlightColour) => {
    setColour(next);
    setLastHighlightColour(next);
    if (highlight) colourHighlight(highlight.id, next);
  };

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

        <blockquote className="hlSheet__quote" data-colour={colour}>
          {quote}
        </blockquote>

        <Swatches value={colour} onPick={pick} />

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
                onClick={() => onSave(draft, colour)}
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

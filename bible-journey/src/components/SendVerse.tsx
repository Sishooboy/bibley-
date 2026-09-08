import { useEffect, useState } from 'react';
import { verseRef } from '../lib/highlight';
import { loadFriends, sendPassage, type Friend } from '../lib/friendsApi';
import { chime } from '../lib/sound';
import type { Spot } from '../lib/storage';
import { useCloud } from '../state/useCloud';

/** Everything a passage needs to be handed to somebody: a reference, never words. */
export type Sendable = {
  book: string;
  chapter: number;
  from: Spot;
  to: Spot;
};

/**
 * Hand one passage to one person, which is the reason friends exists at all.
 *
 * **The message box starts empty and is never the highlight's own note.**
 * That note is the private half of the app and the whole design rests on it
 * never leaving the device except deliberately, so prefilling it would put one
 * tap between a private thought and somebody else reading it. Two boxes that
 * look alike doing opposite things is exactly the kind of quiet mistake this
 * app tries not to make, so the label says who it is going to.
 *
 * The friend list is fetched when this opens rather than held by the reader,
 * because the reader is on screen constantly and this is not.
 */
export function SendVerse({
  sendable,
  quote,
  onClose,
}: {
  sendable: Sendable;
  quote: string;
  onClose: () => void;
}) {
  const { userId } = useCloud();
  const [friends, setFriends] = useState<Friend[] | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [thought, setThought] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setFriends([]);
      return;
    }
    let live = true;
    loadFriends(userId)
      .then((all) => {
        if (!live) return;
        const ready = all
          .filter((f) => f.status === 'accepted')
          .sort((a, b) => a.displayName.localeCompare(b.displayName));
        setFriends(ready);
        // One friend is the common case, so it is chosen already and sending is
        // a single press rather than a pick followed by a press.
        if (ready.length === 1) setTo(ready[0].userId);
      })
      .catch(() => {
        if (live) setFriends([]);
      });
    return () => {
      live = false;
    };
  }, [userId]);

  const reference = verseRef(
    sendable.book,
    sendable.chapter,
    sendable.from.verse,
    sendable.to.verse,
  );

  if (sent) {
    return (
      <div className="sendVerse sendVerse--done">
        <p className="sendVerse__done">
          {reference} is on its way to {sent}.
        </p>
        <button type="button" className="btn btn--sm" onClick={onClose}>
          Done
        </button>
      </div>
    );
  }

  return (
    <div className="sendVerse">
      {friends === null ? (
        <p className="sendVerse__note">Looking up who you read with…</p>
      ) : friends.length === 0 ? (
        <p className="sendVerse__note">
          Nobody to send it to yet. Add someone on the Friends screen and this passage will still be
          here.
        </p>
      ) : (
        <>
          <p className="sendVerse__label">Send {reference} to</p>
          <ul className="sendVerse__people">
            {friends.map((f) => (
              <li key={f.userId}>
                <button
                  type="button"
                  className={`sendVerse__person${to === f.userId ? ' sendVerse__person--on' : ''}`}
                  aria-pressed={to === f.userId}
                  onClick={() => setTo(f.userId)}
                >
                  {f.displayName}
                </button>
              </li>
            ))}
          </ul>

          <label className="sendVerse__label" htmlFor="send-thought">
            A message for them
          </label>
          <textarea
            id="send-thought"
            className="field sendVerse__thought"
            rows={2}
            maxLength={500}
            value={thought}
            onChange={(e) => setThought(e.target.value)}
            placeholder="Thought of you when I read this."
          />
          {/*
            Said out loud, because the two boxes look alike and do opposite
            things: this one goes to somebody, and the note in the sheet behind
            it never leaves the device.
          */}
          <p className="sendVerse__aside">Optional, and separate from your own note.</p>

          {error && <p className="sendVerse__note">{error}</p>}

          <div className="hlSheet__actions">
            <button
              type="button"
              className="btn btn--sm btn--primary"
              disabled={!to || busy || !userId}
              onClick={async () => {
                if (!to || !userId) return;
                setBusy(true);
                setError(null);
                try {
                  await sendPassage({
                    from: userId,
                    to,
                    book: sendable.book,
                    chapter: sendable.chapter,
                    fromVerse: sendable.from.verse,
                    fromOffset: sendable.from.offset,
                    toVerse: sendable.to.verse,
                    toOffset: sendable.to.offset,
                    thought: thought.trim() || null,
                  });
                  // Not a Cue: nothing in the journal changed, the same reason
                  // the two insight chimes are not on the ladder either.
                  chime('note');
                  setSent(friends.find((f) => f.userId === to)?.displayName ?? 'them');
                } catch {
                  setError('That could not be sent. Your highlight is safe either way.');
                } finally {
                  setBusy(false);
                }
              }}
            >
              Send
            </button>
            <button type="button" className="btn btn--sm btn--ghost" onClick={onClose}>
              Cancel
            </button>
          </div>
        </>
      )}

      {friends !== null && friends.length === 0 && (
        <div className="hlSheet__actions">
          <button type="button" className="btn btn--sm btn--ghost" onClick={onClose}>
            Back
          </button>
        </div>
      )}

      <blockquote className="sendVerse__quote">{quote}</blockquote>
    </div>
  );
}

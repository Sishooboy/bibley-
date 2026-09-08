import { useEffect, useState } from 'react';
import { verseRef } from '../lib/highlight';
import { loadFriends, postBroadcast, sendPassage, type Friend } from '../lib/friendsApi';
import { today } from '../lib/dates';
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
  mode = 'send',
  onClose,
}: {
  sendable: Sendable;
  quote: string;
  /**
   * 'send' hands it to one person, 'post' puts it up for everybody you read
   * with. One component because the two differ by a recipient and a verb:
   * the passage, the quote, the message box and the whole layout are the same,
   * and two files would drift the first time either was touched.
   */
  mode?: 'send' | 'post';
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
    // Posting goes to everybody at once, so there is nobody to choose and no
    // reason to fetch the list.
    if (!userId || mode === 'post') {
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
  }, [userId, mode]);

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
          {mode === 'post' ? `${reference} is up for today.` : `${reference} is on its way to ${sent}.`}
        </p>
        <button type="button" className="btn btn--sm" onClick={onClose}>
          Done
        </button>
      </div>
    );
  }

  /*
   * The passage, at the top, where the thing being sent belongs.
   *
   * It used to sit at the bottom in the muted colour, under the message box,
   * which put the two halves the wrong way round: the verse is the subject and
   * the message is the annotation, and they looked alike enough that it was not
   * obvious which one was going to be read by somebody else. It is set in the
   * display face on the paper tint with the gold edge the reader already uses
   * for a highlight, so it reads as scripture; the message below is a plain
   * input in the body face, so it reads as typing.
   */
  const passage = (
    <div className="sendVerse__passage">
      <p className="sendVerse__ref">{reference}</p>
      <blockquote className="sendVerse__quote">{quote}</blockquote>
    </div>
  );

  if (mode === 'post') {
    return (
      <div className="sendVerse">
        <p className="sendVerse__label">Putting up for today</p>
        {passage}
        <p className="sendVerse__aside">
          Everybody you read with sees it, and it replaces whatever you put up earlier today.
        </p>

        <label className="sendVerse__label" htmlFor="post-thought">
          Your words, not the verse
        </label>
        <textarea
          id="post-thought"
          className="field sendVerse__thought"
          rows={2}
          maxLength={280}
          value={thought}
          onChange={(e) => setThought(e.target.value)}
          placeholder="Optional."
        />

        {error && <p className="sendVerse__note">{error}</p>}

        <div className="hlSheet__actions">
          <button
            type="button"
            className="btn btn--sm btn--primary"
            disabled={busy || !userId}
            onClick={async () => {
              if (!userId) return;
              setBusy(true);
              setError(null);
              try {
                await postBroadcast({
                  userId,
                  // The poster's own day, so "today" means their today wherever
                  // they are reading from.
                  day: today(),
                  book: sendable.book,
                  chapter: sendable.chapter,
                  fromVerse: sendable.from.verse,
                  toVerse: sendable.to.verse,
                  thought: thought.trim() || null,
                });
                chime('note');
                setSent('everyone');
              } catch {
                setError('That could not be posted. Your highlight is safe either way.');
              } finally {
                setBusy(false);
              }
            }}
          >
            Put it up
          </button>
          <button type="button" className="btn btn--sm btn--ghost" onClick={onClose}>
            Cancel
          </button>
        </div>
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
          <p className="sendVerse__label">Sending</p>
          {passage}

          <p className="sendVerse__label">To</p>
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
            Your words, not the verse
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
        <>
          {passage}
          <div className="hlSheet__actions">
            <button type="button" className="btn btn--sm btn--ghost" onClick={onClose}>
              Back
            </button>
          </div>
        </>
      )}
    </div>
  );
}

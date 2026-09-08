import { useCallback, useEffect, useMemo, useState } from 'react';
import { HeadChip, ViewHeader } from '../components/ViewHeader';
import { formatDay } from '../lib/dates';
import { verseRef } from '../lib/highlight';
import { plural } from '../lib/format';
import { useReveal } from '../lib/motion';
import {
  isValidHandle,
  normalizeHandle,
  presenceOf,
  suggestHandle,
  type FriendPresence,
} from '../lib/friends';
import {
  acceptFriend,
  findByHandle,
  loadFriends,
  loadInbox,
  loadMyProfile,
  markPassageSeen,
  removeFriend,
  requestFriend,
  saveMyProfile,
  type Friend,
  type Passage,
  type Profile,
} from '../lib/friendsApi';
import { useCloud } from '../state/useCloud';

/**
 * Friends, and deliberately not a leaderboard.
 *
 * **The list is never sorted by anything anyone can climb.** That one rule
 * decides most of this file. Sorting by streak, or floating whoever read today
 * to the top, turns reading scripture into standings, which is the thing this
 * app has refused to do everywhere else: `streakRisk` is not allowed to bluff,
 * the share card was made impersonal on purpose, and Stats stopped saying the
 * same number four times. So the order is alphabetical, and it stays that way
 * whatever anybody does.
 *
 * There is no feed either. A feed is where this becomes performance, and an
 * engagement loop is a bad thing for a Bible app to grow.
 */
export function FriendsView() {
  const { userId, displayName } = useCloud();
  const reveal = useReveal();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [inbox, setInbox] = useState<Passage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const [mine, list, verses] = await Promise.all([
        loadMyProfile(userId),
        loadFriends(userId),
        loadInbox(),
      ]);
      setProfile(mine);
      setFriends(list);
      setInbox(verses);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Something went wrong reaching your account. Everything you have read is safe on this device.',
      );
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const accepted = useMemo(
    () =>
      friends
        .filter((f) => f.status === 'accepted')
        // Alphabetical, and never by a number. See the note at the top.
        .sort((a, b) => a.displayName.localeCompare(b.displayName)),
    [friends],
  );
  const requests = useMemo(
    () => friends.filter((f) => f.status === 'pending' && f.incoming),
    [friends],
  );
  const waiting = useMemo(
    () => friends.filter((f) => f.status === 'pending' && !f.incoming),
    [friends],
  );

  // No id covers every reason there is no account yet: signed out, a session
  // still being restored, and a build with no cloud project at all.
  if (!userId) {
    return (
      <>
        <ViewHeader
          eyebrow="Together"
          title="Friends"
          lede="Sign in to read alongside people you know."
        />
        <div className="container">
          <section className="card">
            <p className="card__note">
              Friends lives in your account, so it needs you signed in. Everything you have read is
              kept on this device either way.
            </p>
          </section>
        </div>
      </>
    );
  }

  return (
    <>
      <ViewHeader
        eyebrow="Together"
        title="Friends"
        lede="A few people reading the same book, and somewhere to hand one of them a verse."
        meta={
          <>
            <HeadChip>{plural(accepted.length, 'friend')}</HeadChip>
            {requests.length > 0 && <HeadChip gold>{requests.length} waiting on you</HeadChip>}
          </>
        }
      />

      <div className="container friendsView">
        {error && (
          <section className="card">
            <p className="card__note">{error}</p>
          </section>
        )}

        {/*
          The handle sits on top as a prompt, never as a gate. It used to be
          the entire screen until it was filled in, which meant an account
          with friends already waiting saw a form and nothing else. A handle
          is what lets somebody add *you*; it was never what lets you see
          them.
        */}
        {!profile && (
          <HandleCard
            userId={userId}
            suggestedName={displayName}
            onSaved={refresh}
            reveal={reveal}
          />
        )}
          {requests.length > 0 && (
            <section ref={reveal} className="card reveal">
              <div className="card__head">
                <div>
                  <h3 className="card__title">Waiting on you</h3>
                  <p className="card__note">
                    They can see nothing at all until you say yes.
                  </p>
                </div>
              </div>
              <ul className="friendList">
                {requests.map((f) => (
                  <li key={f.userId} className="friendRow friendRow--request">
                    <div className="friendRow__who">
                      <p className="friendRow__name">{f.displayName}</p>
                      <p className="friendRow__line">@{f.handle}</p>
                    </div>
                    <div className="friendRow__actions">
                      <button
                        type="button"
                        className="btn btn--sm btn--primary"
                        onClick={async () => {
                          await acceptFriend(userId, f.userId);
                          await refresh();
                        }}
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        className="btn btn--sm"
                        onClick={async () => {
                          await removeFriend(userId, f.userId);
                          await refresh();
                        }}
                      >
                        Not now
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {inbox.length > 0 && (
            <section ref={reveal} className="card reveal">
              <div className="card__head">
                <div>
                  <h3 className="card__title">Verses for you</h3>
                  <p className="card__note">Passages someone thought of you while reading.</p>
                </div>
              </div>
              <ul className="friendVerses">
                {inbox.map((p) => (
                  <VerseCard
                    key={p.id}
                    passage={p}
                    mine={p.from_user === userId}
                    from={friends.find((f) => f.userId === p.from_user)?.displayName ?? 'A friend'}
                  />
                ))}
              </ul>
            </section>
          )}

          <section ref={reveal} className="card reveal">
            <div className="card__head">
              <div>
                <h3 className="card__title">Reading too</h3>
                <p className="card__note">
                  In alphabetical order, and never by whose streak is longest.
                </p>
              </div>
            </div>
            {loading && accepted.length === 0 ? (
              <p className="card__note">Looking…</p>
            ) : accepted.length === 0 ? (
              <p className="card__note">
                {profile
                  ? `Nobody yet. Share your handle, @${profile.handle}, with someone who reads.`
                  : 'Nobody yet. Pick a handle above and somebody can add you.'}
              </p>
            ) : (
              <ul className="friendList">
                {accepted.map((f) => (
                  <FriendRow key={f.userId} friend={f} />
                ))}
              </ul>
            )}
          </section>

          {/*
            These two are the only things that genuinely need a handle: you
            cannot ask somebody to add you without one, since a friendship whose
            profile is missing is skipped on the other side.
          */}
          {profile && (
            <AddCard
              userId={userId}
              myHandle={profile.handle}
              known={friends.map((f) => f.handle)}
              waiting={waiting}
              onChanged={refresh}
              reveal={reveal}
            />
          )}

          {profile && (
            <HandleCard
              userId={userId}
              existing={profile}
              suggestedName={displayName}
              onSaved={refresh}
              reveal={reveal}
            />
          )}
      </div>
    </>
  );
}

/**
 * One person, and what they are willing to say.
 *
 * The dot is the only thing on here that is always true, so it is the only
 * thing given colour. Everything else is a sentence, because a sentence cannot
 * be compared at a glance the way a row of numbers can.
 */
function FriendRow({ friend }: { friend: Friend }) {
  const p = presenceOf(friend.progress);
  return (
    <li className="friendRow">
      <span
        className={`friendRow__dot${p.today ? ' friendRow__dot--today' : ''}`}
        aria-hidden="true"
      />
      <div className="friendRow__who">
        <p className="friendRow__name">{friend.displayName}</p>
        <p className="friendRow__line">{describe(p, friend)}</p>
      </div>
      {p.streak !== null && (
        <span className="friendRow__streak" title="Days in a row">
          {p.streak}
          <span className="friendRow__streakUnit">days</span>
        </span>
      )}
    </li>
  );
}

/**
 * The words on a friend's row.
 *
 * A lapsed friend gets a plain statement of when they last read and no number
 * at all. `presenceOf` is where that is decided and why.
 */
function describe(p: FriendPresence, friend: Friend): string {
  if (p.daysSince === null) return 'Not started yet';
  const percent = friend.progress?.plan_percent ?? null;
  const place = p.where ? ` in ${p.where}` : '';
  const along = percent !== null && percent > 0 ? `, ${percent}% along` : '';
  if (p.today) return `Read today${place}${along}`;
  if (p.daysSince === 1) return `Read yesterday${place}${along}`;
  if (p.daysSince < 7) return `Last read ${p.daysSince} days ago${place}`;
  const day = friend.progress?.last_read_day;
  return day ? `Last read ${formatDay(day)}` : 'Not read in a while';
}

function VerseCard({
  passage,
  from,
  mine,
}: {
  passage: Passage;
  from: string;
  mine: boolean;
}) {
  const [seen, setSeen] = useState(passage.seen_at !== null);
  const ref = verseRef(passage.book, passage.chapter, passage.from_verse, passage.to_verse);
  return (
    <li className={`friendVerse${seen || mine ? '' : ' friendVerse--fresh'}`}>
      <p className="friendVerse__ref">{ref}</p>
      {passage.thought && <p className="friendVerse__thought">{passage.thought}</p>}
      <p className="friendVerse__from">
        {mine ? 'You sent this' : `From ${from}`}
        <span className="friendVerse__when">{formatDay(passage.created_at.slice(0, 10))}</span>
      </p>
      {!seen && !mine && (
        <button
          type="button"
          className="btn btn--sm"
          onClick={async () => {
            // Optimistic: marking a verse read is not worth a spinner, and the
            // worst case is it comes back unread on the next load.
            setSeen(true);
            await markPassageSeen(passage.id);
          }}
        >
          Mark as read
        </button>
      )}
    </li>
  );
}

/** Add somebody by their handle, which is the only way anyone is findable. */
function AddCard({
  userId,
  myHandle,
  known,
  waiting,
  onChanged,
  reveal,
}: {
  userId: string;
  myHandle: string;
  known: string[];
  waiting: Friend[];
  onChanged: () => Promise<void>;
  reveal: (el: Element | null) => void;
}) {
  const [value, setValue] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <section ref={reveal} className="card reveal">
      <div className="card__head">
        <div>
          <h3 className="card__title">Add someone</h3>
          <p className="card__note">
            By handle, so nobody can be found by their email address. Yours is{' '}
            <strong>@{myHandle}</strong>.
          </p>
        </div>
      </div>
      <form
        className="friendAdd"
        onSubmit={async (e) => {
          e.preventDefault();
          const handle = normalizeHandle(value);
          setNote(null);
          if (handle === myHandle) {
            setNote('That one is you.');
            return;
          }
          if (!isValidHandle(handle)) {
            setNote('Handles are 3 to 20 letters, numbers or underscores.');
            return;
          }
          if (known.includes(handle)) {
            setNote('You two are already connected.');
            return;
          }
          setBusy(true);
          try {
            const found = await findByHandle(handle);
            if (!found) {
              setNote('Nobody has that handle.');
              return;
            }
            await requestFriend(userId, found.user_id);
            setValue('');
            setNote(`Asked ${found.display_name}. They will see it next time they open Bibley.`);
            await onChanged();
          } catch {
            setNote('That could not be sent. Try again in a moment.');
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="sr-only" htmlFor="friend-handle">
          Their handle
        </label>
        <span className="friendAdd__at">@</span>
        <input
          id="friend-handle"
          className="field friendAdd__input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="handle"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
        />
        <button type="submit" className="btn btn--primary" disabled={busy || value.trim() === ''}>
          Ask
        </button>
      </form>
      {note && <p className="card__note friendAdd__note">{note}</p>}
      {waiting.length > 0 && (
        <p className="card__note">
          Waiting to hear back from {waiting.map((f) => `@${f.handle}`).join(', ')}.
        </p>
      )}
    </section>
  );
}

/**
 * Your handle and what you publish.
 *
 * Two positions rather than five toggles. Five is a control panel nobody reads,
 * and the real question only has two answers: whether the numbers go out at
 * all. Quiet still receives verses, and still shows that you read today, which
 * is the whole of what it means to be here without being counted.
 */
function HandleCard({
  userId,
  existing,
  suggestedName,
  onSaved,
  reveal,
}: {
  userId: string;
  existing?: Profile;
  /** The name Google gave us, so the form arrives answered rather than blank. */
  suggestedName?: string | null;
  onSaved: () => Promise<void>;
  reveal: (el: Element | null) => void;
}) {
  /*
   * Filled in from the account on a first visit. Sign-in asks for nothing, so
   * this is the only form in the app, and a form is where people leave. Two of
   * its three answers are already known.
   */
  const [handle, setHandle] = useState(
    existing?.handle ?? suggestHandle(suggestedName ?? ''),
  );
  const [name, setName] = useState(existing?.display_name ?? suggestedName ?? '');
  const [visibility, setVisibility] = useState(existing?.visibility ?? 'reading');
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const first = !existing;

  return (
    <section ref={reveal} className="card reveal">
      <div className="card__head">
        <div>
          <h3 className="card__title">{first ? 'Pick a handle' : 'How you appear'}</h3>
          <p className="card__note">
            {first
              ? 'A handle is how somebody adds you. Nothing about your reading is published until you have one.'
              : 'What friends see, and how much of it.'}
          </p>
        </div>
      </div>
      <form
        className="handleForm"
        onSubmit={async (e) => {
          e.preventDefault();
          const wanted = normalizeHandle(handle);
          setNote(null);
          if (!isValidHandle(wanted)) {
            setNote('Handles are 3 to 20 letters, numbers or underscores.');
            return;
          }
          if (name.trim() === '') {
            setNote('A name helps people know it is you.');
            return;
          }
          setBusy(true);
          try {
            await saveMyProfile({
              user_id: userId,
              handle: wanted,
              display_name: name.trim(),
              visibility,
            });
            await onSaved();
          } catch {
            setNote('That handle is taken, or it could not be saved.');
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="handleForm__field">
          <label className="handleForm__label" htmlFor="my-handle">
            Handle
          </label>
          <div className="friendAdd">
            <span className="friendAdd__at">@</span>
            <input
              id="my-handle"
              className="field friendAdd__input"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
            />
          </div>
        </div>
        <div className="handleForm__field">
          <label className="handleForm__label" htmlFor="my-name">
            Name
          </label>
          <input
            id="my-name"
            className="field"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
          />
        </div>
        <fieldset className="handleForm__field handleForm__modes">
          <legend className="handleForm__label">What friends see</legend>
          <label className="modeOption">
            <input
              type="radio"
              name="visibility"
              checked={visibility === 'reading'}
              onChange={() => setVisibility('reading')}
            />
            <span>
              <strong>Reading.</strong> Your streak, how far along you are, and the book you are in.
            </span>
          </label>
          <label className="modeOption">
            <input
              type="radio"
              name="visibility"
              checked={visibility === 'quiet'}
              onChange={() => setVisibility('quiet')}
            />
            <span>
              <strong>Quiet.</strong> Only that you read today. No numbers leave this device at all.
            </span>
          </label>
        </fieldset>
        <div className="card__actions">
          <button type="submit" className="btn btn--primary" disabled={busy}>
            {first ? 'Start' : 'Save'}
          </button>
        </div>
      </form>
      {note && <p className="card__note">{note}</p>}
    </section>
  );
}

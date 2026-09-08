import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { FoldCard } from '../components/FoldCard';
import { PhotoCrop } from '../components/PhotoCrop';
import { HeadChip, ViewHeader } from '../components/ViewHeader';
import { cachedBook, loadBook } from '../lib/bible';
import { formatDay, today } from '../lib/dates';
import { Chevron, Flame } from '../components/icons';
import { verseRef } from '../lib/highlight';
import { plural } from '../lib/format';
import { useReveal } from '../lib/motion';
import {
  isValidHandle,
  normalizeHandle,
  inInbox,
  presenceOf,
  suggestHandle,
  threadsFrom,
  versesFor,
  type FriendPresence,
} from '../lib/friends';
import {
  acceptFriend,
  clearBroadcast,
  deletePassage,
  findByHandle,
  loadBroadcasts,
  loadFriends,
  loadThreads,
  loadMyProfile,
  markPassageSeen,
  removeFriend,
  requestFriend,
  saveMyProfile,
  uploadAvatar,
  type Broadcast,
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
  const [mail, setMail] = useState<Passage[]>([]);
  const [board, setBoard] = useState<Broadcast[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const [mine, list, verses, posts] = await Promise.all([
        loadMyProfile(userId),
        loadFriends(userId),
        loadThreads(),
        loadBroadcasts(),
      ]);
      setProfile(mine);
      setFriends(list);
      /*
       * `inInbox` prunes what they sent you, never what you sent them. A
       * conversation you can see half of is worse than a long one: your own
       * lines vanishing under you would read as the app losing them.
       */
      setMail(verses.filter((v) => v.from_user === userId || inInbox(v)));
      setBoard(posts);
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
        <BoardCard
          userId={userId}
          board={board}
          friends={accepted}
          me={profile}
          onChanged={refresh}
          reveal={reveal}
        />

        <MailCard
          userId={userId}
          mail={mail}
          friends={accepted}
          onChanged={refresh}
          reveal={reveal}
        />

        {/*
          One card for every question about people: who is waiting, who you read
          with, and how to add somebody. Those were three panels, which is one
          panel per function rather than one per question, and the screen read as
          a stack of unrelated boxes.
        */}
        <section ref={reveal} className="card reveal">
          <div className="card__head">
            <div>
              <h3 className="card__title">Reading together</h3>
              <p className="card__note">
                In alphabetical order, and never by whose streak is longest.
              </p>
            </div>
          </div>

          {requests.length > 0 && (
            <>
              <p className="friendGroup">
                Waiting on you. They can see nothing at all until you say yes.
              </p>
              <ul className="friendList friendList--requests">
                {requests.map((f) => (
                  <li key={f.userId} className="friendRow friendRow--request">
                    {/* No dot: a pending request must reveal nothing, and
                        whether they read today is something. */}
                    <Avatar name={f.displayName} url={f.avatarUrl} />
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
            </>
          )}

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
                <FriendRow
                  key={f.userId}
                  friend={f}
                  onRemove={async () => {
                    await removeFriend(userId, f.userId);
                    await refresh();
                  }}
                />
              ))}
            </ul>
          )}

          {/*
            Adding somebody is the footer of the list rather than a panel of its
            own: it is the same question the list answers, asked forwards.
            It needs a handle, since a friendship whose profile is missing is
            skipped on the other side.
          */}
          {profile && (
            <AddRow
              userId={userId}
              myHandle={profile.handle}
              known={friends.map((f) => f.handle)}
              waiting={waiting}
              onChanged={refresh}
            />
          )}
        </section>

        {/*
          Your own handle, face and visibility. Shut, because it is a thing you
          set once and then never open again, and it was taking a full panel at
          the bottom of every visit.
        */}
        {profile && (
          <FoldCard
            title="How you appear"
            summary={`@${profile.handle} · ${profile.visibility === 'quiet' ? 'Quiet' : 'Reading'}`}
            reveal={reveal}
          >
            <HandleCard
              userId={userId}
              existing={profile}
              suggestedName={displayName}
              onSaved={refresh}
              bare
            />
          </FoldCard>
        )}
      </div>
    </>
  );
}

/**
 * A face, or the initials that stand in for one.
 *
 * Initials rather than a silhouette, because a generic head is a photograph of
 * nobody and this app does not do photographs of nobody. They are drawn from
 * the name, so a friend without a picture is still distinguishable at a glance,
 * which is the entire job.
 *
 * The dot rides on the corner rather than sitting beside it: it is a fact about
 * the person, so it belongs on them, and it keeps the row to three columns
 * instead of four.
 */
function Avatar({
  name,
  url,
  today: read,
  size = 38,
}: {
  name: string;
  url: string | null;
  today?: boolean;
  size?: number;
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
  return (
    <span className="avatar" style={{ width: size, height: size }}>
      {url ? (
        // Decorative: the name is right beside it, so a screen reader saying it
        // twice is noise rather than help.
        <img className="avatar__img" src={url} alt="" width={size} height={size} />
      ) : (
        <span className="avatar__initials" aria-hidden="true">
          {initials || '?'}
        </span>
      )}
      {read !== undefined && (
        <span className={`avatar__dot${read ? ' avatar__dot--today' : ''}`} aria-hidden="true" />
      )}
    </span>
  );
}

/**
 * The words behind a shared reference.
 *
 * A passage stores a reference and never the text, so the text is fetched from
 * the same book files the reader uses. `cachedBook` first, so a book already
 * open renders on the first frame rather than flashing an empty card, and the
 * fetch only happens for a book this device has not opened.
 *
 * Nothing is drawn while it is loading. A reference with a spinner under it is
 * worse than a reference on its own, and the reference is already the answer to
 * "what did they send me".
 */
function PassageText({
  book,
  chapter,
  fromVerse,
  toVerse,
}: {
  book: string;
  chapter: number;
  fromVerse: number;
  toVerse: number;
}) {
  const [text, setText] = useState(() =>
    versesFor(cachedBook(book)?.chapters, chapter, fromVerse, toVerse),
  );

  useEffect(() => {
    if (text) return;
    let live = true;
    loadBook(book)
      .then((b) => {
        if (live) setText(versesFor(b.chapters, chapter, fromVerse, toVerse));
      })
      // Offline with that book never opened. The reference still reads, which
      // is why this is a quiet nothing rather than an error.
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [book, chapter, fromVerse, toVerse, text]);

  if (!text) return null;
  return <blockquote className="friendVerse__text">{text}</blockquote>;
}

/**
 * One person, and what they are willing to say.
 *
 * The dot is the only thing on here that is always true, so it is the only
 * thing given colour. Everything else is a sentence, because a sentence cannot
 * be compared at a glance the way a row of numbers can.
 */
function FriendRow({ friend, onRemove }: { friend: Friend; onRemove: () => Promise<void> }) {
  const p = presenceOf(friend.progress);
  const [confirming, setConfirming] = useState(false);
  return (
    <li className="friendRow">
      <Avatar name={friend.displayName} url={friend.avatarUrl} today={p.today} />
      <div className="friendRow__who">
        <p className="friendRow__name">{friend.displayName}</p>
        <p className="friendRow__line">{describe(p, friend)}</p>
      </div>
      {confirming ? (
        <div className="friendRow__actions">
          <button type="button" className="btn btn--sm btn--danger" onClick={onRemove}>
            Remove
          </button>
          <button
            type="button"
            className="btn btn--sm btn--ghost"
            onClick={() => setConfirming(false)}
          >
            Keep
          </button>
        </div>
      ) : (
        <>
          {p.streak !== null && (
            <span className="friendRow__streak" title="Days in a row">
              <Flame size={13} className="friendRow__flame" />
              {p.streak}
              <span className="friendRow__streakUnit">days</span>
            </span>
          )}
          {/*
            Unfriending was reachable only for a request you had not answered,
            so an accepted friendship was permanent from inside the app. It sits
            behind a confirm because it is the one destructive thing on here.
          */}
          <button
            type="button"
            className="friendRow__more"
            aria-label={`Remove ${friend.displayName}`}
            onClick={() => setConfirming(true)}
          >
            ×
          </button>
        </>
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

/**
 * A passage somebody handed you.
 *
 * **The words are the point and they were missing.** The card printed the
 * reference and the sender's thought and stopped, so a verse arrived as a
 * citation: you had to go and look it up to find out what you had been sent,
 * which is most of the way to not bothering. `PassageText` reads it out of the
 * same book files the reader uses.
 */
/**
 * The exchanges, one per person.
 *
 * A one way inbox was half a conversation: you could be handed a verse and had
 * nowhere to answer, so the app had a letterbox rather than a correspondence.
 * The rows already carried both ends, so this is a grouping rather than a
 * table: `threadsFrom` does it, and it is pure so the ordering is tested.
 *
 * Shut by default and one open at a time, which is the same shape Notes
 * settled on. A screen of every message anybody ever sent is a feed, and this
 * app has refused one everywhere else.
 */
function MailCard({
  userId,
  mail,
  friends,
  onChanged,
  reveal,
}: {
  userId: string;
  mail: Passage[];
  friends: Friend[];
  onChanged: () => Promise<void>;
  reveal: (el: Element | null) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const threads = useMemo(() => threadsFrom(mail, userId), [mail, userId]);
  const unread = threads.reduce((n, t) => n + t.unread, 0);

  if (threads.length === 0) {
    return (
      <section ref={reveal} className="card reveal">
        <div className="card__head">
          <div>
            <h3 className="card__title">Between you</h3>
            <p className="card__note">
              Nothing yet. Highlight a verse while you read and choose "Send to a friend", and the
              back and forth lands here.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section ref={reveal} className="card reveal">
      <div className="card__head">
        <div>
          <h3 className="card__title">Between you</h3>
          <p className="card__note">
            {unread > 0
              ? `${plural(unread, 'verse')} waiting to be read.`
              : 'Verses passed back and forth, newest name first.'}
          </p>
        </div>
      </div>

      <ul className="threadList">
        {threads.map((t) => {
          const friend = friends.find((f) => f.userId === t.withUser);
          const name = friend?.displayName ?? 'A friend';
          const last = t.messages[t.messages.length - 1];
          const isOpen = open === t.withUser;
          return (
            <li key={t.withUser} className="thread">
              <button
                type="button"
                className="thread__head"
                aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? null : t.withUser)}
              >
                <Avatar name={name} url={friend?.avatarUrl ?? null} size={34} />
                <span className="thread__who">
                  <span className="thread__name">{name}</span>
                  <span className="thread__last">
                    {last.from_user === userId ? 'You sent ' : ''}
                    {verseRef(last.book, last.chapter, last.from_verse, last.to_verse)}
                  </span>
                </span>
                {t.unread > 0 && (
                  <span className="thread__unread" aria-label={`${t.unread} unread`}>
                    {t.unread}
                  </span>
                )}
                <Chevron size={14} className={`thread__chev${isOpen ? ' thread__chev--open' : ''}`} />
              </button>

              {isOpen && (
                <ol className="thread__messages">
                  {t.messages.map((m) => (
                    <Bubble
                      key={m.id}
                      passage={m}
                      mine={m.from_user === userId}
                      onSeen={async () => {
                        await markPassageSeen(m.id);
                        await onChanged();
                      }}
                      onDelete={async () => {
                        await deletePassage(m.id);
                        await onChanged();
                      }}
                    />
                  ))}
                </ol>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * One verse in an exchange.
 *
 * Yours and theirs lean to opposite sides, which is the one convention every
 * reader already knows and costs nothing but a margin. The verse keeps the
 * scripture treatment it has everywhere else, and the message under it stays a
 * plain sentence, so the two never blur into each other.
 */
function Bubble({
  passage,
  mine,
  onSeen,
  onDelete,
}: {
  passage: Passage;
  mine: boolean;
  onSeen: () => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const ref = verseRef(passage.book, passage.chapter, passage.from_verse, passage.to_verse);

  /* Opening the thread is reading it, so theirs are marked once they are drawn. */
  useEffect(() => {
    if (mine || passage.seen_at) return;
    void onSeen();
    // Deliberately once per message: onSeen changes identity every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [passage.id]);

  return (
    <li className={`bubble${mine ? ' bubble--mine' : ''}`}>
      <p className="bubble__ref">{ref}</p>
      <PassageText
        book={passage.book}
        chapter={passage.chapter}
        fromVerse={passage.from_verse}
        toVerse={passage.to_verse}
      />
      {passage.thought && <p className="bubble__thought">{passage.thought}</p>}
      <p className="bubble__foot">
        <span>{formatDay(passage.created_at.slice(0, 10))}</span>
        <button type="button" className="bubble__remove" onClick={onDelete}>
          Remove
        </button>
      </p>
    </li>
  );
}

/**
 * The verse of the day, yours and everybody's.
 *
 * This is the one place the app leans toward a feed, and the shape is what
 * keeps it from becoming one. **One verse per person per day, enforced by the
 * primary key**, so there is nothing to scroll, nobody can post six times, and
 * a board that is empty today simply says so. Posting is done from the reader,
 * where you are when a verse strikes you, rather than from a picker here.
 */
function BoardCard({
  userId,
  board,
  friends,
  me,
  onChanged,
  reveal,
}: {
  userId: string;
  board: Broadcast[];
  friends: Friend[];
  me: Profile | null;
  onChanged: () => Promise<void>;
  reveal: (el: Element | null) => void;
}) {
  /*
   * The newest day each person posted, which is not the same as "today".
   * A friend nine hours ahead has already started tomorrow, so filtering on
   * your own date would hide what they put up an hour ago.
   */
  const latest = useMemo(() => {
    const best = new Map<string, Broadcast>();
    for (const b of board) {
      const seen = best.get(b.user_id);
      if (!seen || b.day > seen.day) best.set(b.user_id, b);
    }
    return best;
  }, [board]);

  const mine = latest.get(userId) ?? null;
  const theirs = friends
    .map((f) => ({ friend: f, post: latest.get(f.userId) }))
    .filter((x): x is { friend: Friend; post: Broadcast } => Boolean(x.post));

  if (!mine && theirs.length === 0) {
    return (
      <section ref={reveal} className="card card--night reveal">
        <div className="card__head">
          <div>
            <h3 className="card__title">Verse of the day</h3>
            <p className="card__note">
              Nothing up yet. Highlight something while you read and choose "Put it up for today",
              and everybody you read with sees it until tomorrow.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section ref={reveal} className="card card--night reveal">
      <div className="card__head">
        <div>
          <h3 className="card__title">Verse of the day</h3>
          <p className="card__note">One each, replaced rather than added to.</p>
        </div>
      </div>
      <ul className="board">
        {mine && (
          <BoardItem
            key="mine"
            post={mine}
            name={me?.display_name ?? 'You'}
            avatar={me?.avatar_url ?? null}
            onClear={async () => {
              await clearBroadcast(userId, mine.day);
              await onChanged();
            }}
          />
        )}
        {theirs.map(({ friend, post }) => (
          <BoardItem
            key={friend.userId}
            post={post}
            name={friend.displayName}
            avatar={friend.avatarUrl}
          />
        ))}
      </ul>
    </section>
  );
}

function BoardItem({
  post,
  name,
  avatar,
  onClear,
}: {
  post: Broadcast;
  name: string;
  avatar: string | null;
  onClear?: () => Promise<void>;
}) {
  const ref = verseRef(post.book, post.chapter, post.from_verse, post.to_verse);
  const mine = Boolean(onClear);
  return (
    <li className={`board__item${mine ? ' board__item--mine' : ''}`}>
      <div className="board__who">
        <Avatar name={name} url={avatar} size={28} />
        <span className="board__name">{mine ? 'You' : name}</span>
        {post.day !== today() && <span className="board__day">{formatDay(post.day)}</span>}
      </div>
      <p className="friendVerse__ref">{ref}</p>
      <PassageText
        book={post.book}
        chapter={post.chapter}
        fromVerse={post.from_verse}
        toVerse={post.to_verse}
      />
      {post.thought && <p className="friendVerse__thought">{post.thought}</p>}
      {onClear && (
        <button type="button" className="btn btn--sm btn--ghost" onClick={onClear}>
          Take it down
        </button>
      )}
    </li>
  );
}

/**
 * Add somebody by their handle, which is the only way anyone is findable.
 *
 * The footer of the list rather than a panel of its own: it answers the same
 * question the list does, asked forwards, and a card to itself made the screen
 * one box longer for one input.
 */
function AddRow({
  userId,
  myHandle,
  known,
  waiting,
  onChanged,
}: {
  userId: string;
  myHandle: string;
  known: string[];
  waiting: Friend[];
  onChanged: () => Promise<void>;
}) {
  const [value, setValue] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div className="friendAddRow">
      <p className="friendGroup">
        Add someone by handle. Yours is <strong>@{myHandle}</strong>.
      </p>
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
        <p className="card__note friendAdd__note">
          Waiting to hear back from {waiting.map((f) => `@${f.handle}`).join(', ')}.
        </p>
      )}
    </div>
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
  bare,
}: {
  userId: string;
  existing?: Profile;
  /** The name Google gave us, so the form arrives answered rather than blank. */
  suggestedName?: string | null;
  onSaved: () => Promise<void>;
  reveal?: (el: Element | null) => void;
  /**
   * Render the form alone, with no card around it. The fold in "How you
   * appear" is already a card, and a card inside a card is a border inside a
   * border with nothing between them.
   */
  bare?: boolean;
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
  const [avatar, setAvatar] = useState<string | null>(existing?.avatar_url ?? null);
  const [uploading, setUploading] = useState(false);
  /** The photograph waiting to be framed. Nothing is uploaded until it is. */
  const [picking, setPicking] = useState<File | null>(null);
  const [visibility, setVisibility] = useState(existing?.visibility ?? 'reading');
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const first = !existing;

  const Wrapper = bare ? Fragment : 'section';
  const wrapperProps = bare ? {} : { ref: reveal, className: 'card reveal' };

  return (
    <Wrapper {...wrapperProps}>
      {!bare && (
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
      )}
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
              avatar_url: avatar,
            });
            await onSaved();
          } catch {
            setNote('That handle is taken, or it could not be saved.');
          } finally {
            setBusy(false);
          }
        }}
      >
        {/*
          A photograph, which the house rule otherwise forbids. The rule is
          about the app's own furniture, where a stock image reads as pasted on.
          A reader's own face is not furniture: it is how you tell two friends
          apart at a glance, and it is the one image here that means something.
          Initials stand in until there is one, since a generic silhouette is a
          photograph of nobody.
        */}
        <div className="handleForm__field">
          <span className="handleForm__label">Picture</span>
          {picking ? (
            <PhotoCrop
              file={picking}
              onCancel={() => setPicking(null)}
              onCropped={async (square) => {
                setPicking(null);
                setUploading(true);
                try {
                  setAvatar(await uploadAvatar(userId, square));
                } catch {
                  setNote('That picture could not be uploaded.');
                } finally {
                  setUploading(false);
                }
              }}
            />
          ) : (
          <div className="avatarPick">
            <Avatar name={name || 'You'} url={avatar} size={56} />
            <div className="avatarPick__actions">
              <label className="btn btn--sm avatarPick__choose">
                {uploading ? 'Uploading…' : avatar ? 'Change' : 'Add a photo'}
                <input
                  type="file"
                  className="sr-only"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={uploading}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    // The input keeps its value, so choosing the same file twice
                    // would otherwise be a no-op the second time.
                    e.target.value = '';
                    if (!file) return;
                    setNote(null);
                    /*
                     * Framed before it is uploaded, never after. The size is not
                     * checked here because the crop re-encodes at 512 square,
                     * so a twelve megapixel photograph arrives as a file the
                     * bucket's own limit would have accepted anyway.
                     */
                    setPicking(file);
                  }}
                />
              </label>
              {avatar && (
                <button
                  type="button"
                  className="btn btn--sm btn--ghost"
                  onClick={() => setAvatar(null)}
                >
                  Remove
                </button>
              )}
            </div>
          </div>
          )}
          <p className="sendVerse__aside">
            Only people you have accepted can see it. Saved when you press {first ? 'Start' : 'Save'}.
          </p>
        </div>

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
    </Wrapper>
  );
}

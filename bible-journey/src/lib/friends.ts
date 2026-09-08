/*
 * What a friend is allowed to know, and nothing else.
 *
 * The journal is one blob holding notes and highlights, and a friend can never
 * read it: `public.progress` is a projection this file computes, and the row it
 * writes is the only thing about a reader that any other account can see.
 *
 * So the shape below is a whitelist in the same spirit as `normalize()`, and it
 * is built by naming every field rather than by spreading anything. Spreading
 * is how a note ends up on a server: one `...rest` somewhere upstream and the
 * leak is silent, permanent and unnoticeable from the app. `friends.test.ts`
 * stuffs a journal with a canary string and fails if it can be found anywhere
 * in the published row.
 */
import { daysBetween, type DayKey } from './dates';
import type { OverallProgress, Streak } from './progress';
import { parseChapterKey, type AppData } from './storage';

/**
 * 'reading' publishes the card, 'quiet' publishes only whether they read today.
 *
 * Quiet is enforced by writing nulls rather than by hiding columns on read, so
 * a quiet reader's numbers are never on the server at all. Hiding them would
 * mean the server still held them and one policy mistake away from showing
 * them.
 */
export type Visibility = 'reading' | 'quiet';

/** Exactly the columns of `public.progress`, and no others. */
export type PublishedProgress = {
  last_read_day: DayKey | null;
  /**
   * Minutes east of UTC, so Tokyo is +540 and New York is -300. That is the
   * opposite sign to `Date.getTimezoneOffset()`, which counts minutes behind
   * UTC, and the flip happens once, here.
   */
  tz_offset: number;
  streak_current: number | null;
  streak_longest: number | null;
  chapters_read: number | null;
  books_done: number | null;
  plan_id: string | null;
  plan_percent: number | null;
  current_book: string | null;
  current_chapter: number | null;
};

/**
 * The field names above, for the test that fails when this file grows a field
 * nobody thought about. It is deliberately written out rather than derived from
 * the type, because a type disappears at runtime and the point is to catch the
 * commit that adds a field, not to describe the one that exists.
 */
export const PUBLISHED_KEYS: readonly (keyof PublishedProgress)[] = [
  'last_read_day',
  'tz_offset',
  'streak_current',
  'streak_longest',
  'chapters_read',
  'books_done',
  'plan_id',
  'plan_percent',
  'current_book',
  'current_chapter',
];

/** Minutes east of UTC for this device, which is what `tz_offset` stores. */
export function tzOffsetMinutes(now: Date = new Date()): number {
  return -now.getTimezoneOffset();
}

/**
 * The last chapter this reader actually marked, which is what "they are in
 * Job 12" means. Taken from `markedAt` rather than from `read`, because `read`
 * holds the day a chapter was read and a backdated mark would otherwise drag
 * the answer back to whenever the reader says they read it.
 */
function lastMarked(data: AppData): { book: string; chapter: number } | null {
  const marks = data.markedAt;
  if (!marks) return null;
  let bestKey: string | null = null;
  let bestAt = '';
  for (const [key, at] of Object.entries(marks)) {
    // Cleared chapters keep their stamp, so a chapter that is no longer read
    // must not be reported as the one they are in.
    if (!(key in data.read)) continue;
    if (at > bestAt) {
      bestAt = at;
      bestKey = key;
    }
  }
  if (!bestKey) return null;
  const { book, chapter } = parseChapterKey(bestKey);
  return Number.isFinite(chapter) ? { book, chapter } : null;
}

/**
 * Build the row to publish. Every field is named, nothing is spread, and a
 * quiet reader publishes the dot and nothing else.
 */
export function projectProgress(input: {
  data: AppData;
  streak: Streak;
  overall: OverallProgress;
  visibility: Visibility;
  now?: Date;
}): PublishedProgress {
  const { data, streak, overall, visibility } = input;
  const now = input.now ?? new Date();
  const quiet = visibility === 'quiet';
  const at = quiet ? null : lastMarked(data);

  return {
    // The day is published either way. It is the whole of what quiet means:
    // somebody can see you are still reading without seeing how much.
    last_read_day: streak.lastReadDay ?? null,
    tz_offset: tzOffsetMinutes(now),
    streak_current: quiet ? null : streak.current,
    streak_longest: quiet ? null : streak.longest,
    // Paired with plan_percent and plan_id on purpose, so the three numbers on
    // a friend's card describe one journey rather than three different ones.
    chapters_read: quiet ? null : overall.planRead,
    books_done: quiet ? null : overall.booksDone,
    plan_id: quiet ? null : (data.planId ?? null),
    plan_percent: quiet ? null : Math.round(overall.percent),
    current_book: at?.book ?? null,
    current_chapter: at?.chapter ?? null,
  };
}

/**
 * The day key where that reader is, not where you are.
 *
 * Without this, a friend's dot is computed against your midnight: someone in
 * Tokyo who read this morning reads as "not today" to a reader in Montreal for
 * most of the day. The app does not bluff about streaks anywhere else, and a
 * green dot that is confidently wrong is the same kind of small lie.
 */
export function theirToday(tzOffset: number, now: Date = new Date()): DayKey {
  const shifted = new Date(now.getTime() + tzOffset * 60_000);
  const y = shifted.getUTCFullYear();
  const m = `${shifted.getUTCMonth() + 1}`.padStart(2, '0');
  const d = `${shifted.getUTCDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Has this friend read today, in their own day rather than yours? */
export function readToday(
  progress: Pick<PublishedProgress, 'last_read_day' | 'tz_offset'>,
  now: Date = new Date(),
): boolean {
  if (!progress.last_read_day) return false;
  return progress.last_read_day === theirToday(progress.tz_offset, now);
}

/**
 * A published streak is only worth printing while it is still standing up.
 *
 * A row is only rewritten when that reader opens the app, so somebody who read
 * on Monday with a run of twelve and has not been back still has twelve sitting
 * on the server on Friday. Printing it would be inventing a streak on their
 * behalf. One day of slack, so a friend who read yesterday and has not opened
 * the app yet today still reads correctly.
 */
const STREAK_TRUSTED_FOR_DAYS = 1;

export type FriendPresence = {
  /** Their own day says they read today. */
  today: boolean;
  /** Days since they last read, counted in their day. Null if they never have. */
  daysSince: number | null;
  /** The streak worth printing, or null for broken, stale, quiet or absent. */
  streak: number | null;
  /** "Luke 9", or null when they are quiet or have not started. */
  where: string | null;
};

/**
 * What a friend's card is allowed to say.
 *
 * **A streak is shown only while it is alive**, and a lapsed friend gets a
 * plain "last read on such a day" instead of a nought. This is the one place
 * the design had a real choice, and both other answers are worse. Printing
 * `0 day streak` puts a scoreboard's worst number on somebody who is simply
 * having a hard month, on a screen they can see. Printing their *longest*
 * instead is crueller, since it names exactly what they have just lost. And
 * saying nothing at all makes the card lie by omission, because they plainly
 * have been reading at some point.
 *
 * The app already mourns your own broken streak exactly once and then stops
 * talking about it. Somebody else's was never yours to mourn at all, so the
 * card states the fact and offers no number to feel bad about.
 */
export function presenceOf(
  progress: Pick<
    PublishedProgress,
    'last_read_day' | 'tz_offset' | 'streak_current' | 'current_book' | 'current_chapter'
  > | null,
  now: Date = new Date(),
): FriendPresence {
  if (!progress?.last_read_day) {
    return { today: false, daysSince: null, streak: null, where: null };
  }
  const daysSince = daysBetween(progress.last_read_day, theirToday(progress.tz_offset, now));
  const current = progress.streak_current ?? 0;
  return {
    // Negative means their day is ahead of the last day they recorded, which a
    // timezone can produce legitimately, so anything at or under zero is today.
    today: daysSince <= 0,
    daysSince: Math.max(0, daysSince),
    streak: daysSince <= STREAK_TRUSTED_FOR_DAYS && current > 0 ? current : null,
    where: progress.current_book
      ? `${progress.current_book}${progress.current_chapter ? ` ${progress.current_chapter}` : ''}`
      : null,
  };
}

/**
 * The two ids in the order `public.friendships` stores them.
 *
 * The table keeps one row per pair with `user_a < user_b` as a check
 * constraint, which is what makes a duplicate friendship impossible rather than
 * merely unlikely. Postgres compares uuids by their bytes; a lowercase
 * hyphenated uuid compares the same way as a string, since '0' to '9' sorts
 * before 'a' to 'f' in ASCII exactly as it does in hex. **Uppercase does not**,
 * because 'A' is 65 and 'a' is 97, so a capitalised id would sort to the wrong
 * side and write a second row for a pair that already had one.
 */
export function canonicalPair(one: string, two: string): { user_a: string; user_b: string } {
  const a = one.toLowerCase();
  const b = two.toLowerCase();
  return a < b ? { user_a: a, user_b: b } : { user_a: b, user_b: a };
}

/** Mirrors the `profiles_handle_shape` check constraint, so the app can say so first. */
export const HANDLE_SHAPE = /^[a-z0-9_]{3,20}$/;

/**
 * Lowercase is stored, not merely accepted, so uniqueness cannot be dodged by
 * capitalising a letter. The database enforces the same thing, and this exists
 * so a reader is told before a round trip rather than after one.
 */
export function normalizeHandle(input: string): string {
  return input.trim().toLowerCase();
}

export function isValidHandle(input: string): boolean {
  return HANDLE_SHAPE.test(normalizeHandle(input));
}

/**
 * How long a passage somebody has already read stays in the inbox.
 *
 * Three days rather than two, so a verse sent on Friday is still there on
 * Monday.
 */
export const INBOX_DAYS = 3;

/**
 * Does this passage still belong in "Verses for you"?
 *
 * **An unread one never ages out**, however long it has been. The inbox is
 * somebody handing you something, and a gift that expired before you looked at
 * it is worse than a list that got long: the sender has no way to know it went
 * unseen, so they would think you had read it and said nothing. Once it has
 * been read it has done its job and can go, which is what keeps the list from
 * becoming a feed nobody prunes.
 *
 * Nothing is deleted by this. The row stays and the policies still allow it, so
 * a passage leaving the inbox is a change of view rather than a loss.
 */
export function inInbox(
  passage: { created_at: string; seen_at: string | null },
  now: Date = new Date(),
): boolean {
  if (!passage.seen_at) return true;
  const age = now.getTime() - new Date(passage.created_at).getTime();
  return age < INBOX_DAYS * 86_400_000;
}

/**
 * The words a shared passage points at, pulled out of the book it came from.
 *
 * A passage stores the reference and never the text, so this is where a
 * reference becomes something readable. It joins whole verses rather than
 * slicing on the offsets: an offset is a character position inside one verse
 * and the two ends are a highlight's own edges, so slicing would hand somebody
 * a sentence starting mid-word. The offsets stay on the row for the day the
 * reader is taken to the passage in the reader and it needs to light the exact
 * span.
 *
 * A null verse is one this translation does not carry, so it is skipped rather
 * than printed as a gap.
 */
export function versesFor(
  chapters: readonly (readonly (string | null)[])[] | undefined,
  chapter: number,
  fromVerse: number,
  toVerse: number,
): string {
  const verses = chapters?.[chapter - 1];
  if (!verses) return '';
  return verses
    .slice(fromVerse - 1, toVerse)
    .filter((v): v is string => typeof v === 'string' && v.length > 0)
    .join(' ')
    .trim();
}

/** One exchange, newest last, the way a conversation is read. */
export type Thread<T> = {
  /** The other person. */
  withUser: string;
  messages: T[];
  /** When the newest message in it landed, for ordering the list of threads. */
  latest: string;
  /** How many of theirs you have not opened. */
  unread: number;
};

/**
 * Group passages into one exchange per person.
 *
 * A passage already carries both ends, so a conversation is a grouping rather
 * than a new table: the same rows that made a one way inbox make a thread the
 * moment you stop throwing away the ones you sent.
 *
 * **Threads are ordered by their newest message and the messages inside them
 * oldest first.** That is the one ordering a conversation can have: the list
 * answers "who wrote last" and the thread answers "what was said", and those
 * two questions want opposite directions.
 */
export function threadsFrom<
  T extends { from_user: string; to_user: string; created_at: string; seen_at: string | null },
>(passages: readonly T[], userId: string): Thread<T>[] {
  const byPerson = new Map<string, T[]>();
  for (const p of passages) {
    const other = p.from_user === userId ? p.to_user : p.from_user;
    // A passage to yourself is impossible at the database, so this is only
    // defensive about a row that should not exist.
    if (other === userId) continue;
    const list = byPerson.get(other);
    if (list) list.push(p);
    else byPerson.set(other, [p]);
  }

  return [...byPerson.entries()]
    .map(([withUser, messages]) => {
      const ordered = [...messages].sort((a, b) => a.created_at.localeCompare(b.created_at));
      return {
        withUser,
        messages: ordered,
        latest: ordered[ordered.length - 1]?.created_at ?? '',
        unread: ordered.filter((m) => m.to_user === userId && !m.seen_at).length,
      };
    })
    .sort((a, b) => b.latest.localeCompare(a.latest));
}

/**
 * A handle worth offering, from the name Google already gave us.
 *
 * Sign-in asks for nothing, so the first time anybody opens Friends they meet a
 * form, and a form is where people leave. Two of its three fields are already
 * answerable: Google supplies `full_name` on every account here, and a handle
 * follows from it. So the form arrives filled in and the reader is agreeing to
 * something rather than composing it.
 *
 * The first name alone where that is long enough, since `charbel` is a better
 * name to be found by than `charbeljohndagher`, and more of the name only when
 * it has to be. Accents are folded rather than dropped, or `José` would suggest
 * `jos`.
 */
export function suggestHandle(name: string): string {
  const words = name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    // Split on spaces and clean inside a word, rather than splitting on
    // everything a handle cannot hold: Mary-Anne is one name and should suggest
    // `maryanne`, not `mary`.
    .split(/\s+/)
    .map((word) => word.replace(/[^a-z0-9]/g, ''))
    .filter(Boolean);

  let handle = '';
  for (const word of words) {
    handle += word;
    if (handle.length >= 3) break;
  }
  handle = handle.slice(0, 20);
  // Too short to be legal, and padding it with anything invents a name nobody
  // chose, so it is better to hand back nothing and let the field stay empty.
  return handle.length >= 3 ? handle : '';
}

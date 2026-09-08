import { describe, expect, it } from 'vitest';
import {
  PUBLISHED_KEYS,
  canonicalPair,
  isValidHandle,
  normalizeHandle,
  presenceOf,
  suggestHandle,
  projectProgress,
  readToday,
  theirToday,
  tzOffsetMinutes,
  type Visibility,
} from './friends';
import type { OverallProgress, Streak } from './progress';
import type { AppData } from './storage';

/** A string that exists nowhere in the app, so finding it means it travelled. */
const CANARY = 'CANARY-8f3a1c-do-not-publish';

const streak: Streak = {
  current: 12,
  longest: 30,
  lastReadDay: '2026-09-07',
  rest: 1,
  resting: false,
  lastRun: 12,
};

const overall: OverallProgress = {
  planRead: 412,
  planTotal: 1334,
  booksDone: 9,
  booksTotal: 73,
  percent: 30.88,
};

/**
 * A journal with something private in every field that holds words. If any of
 * these can be found in the published row, that is the leak this whole file
 * exists to catch.
 */
function loadedJournal(): AppData {
  return {
    version: 1,
    planId: 'full_arc',
    startedAt: '2026-01-01',
    read: { 'John|3': '2026-09-07', 'Job|12': '2026-09-06' },
    markedAt: { 'John|3': '2026-09-07T10:00:00.000Z', 'Job|12': '2026-09-06T10:00:00.000Z' },
    notes: [
      { id: 'n1', target: 'John|3', body: `a private thought ${CANARY}`, updatedAt: '2026-09-07' },
    ] as unknown as AppData['notes'],
    highlights: [
      {
        id: 'h1',
        book: 'John',
        chapter: 3,
        from: { verse: 16, offset: 0 },
        to: { verse: 16, offset: 20 },
        text: `For God so loved ${CANARY}`,
        note: `why this matters to me ${CANARY}`,
        createdAt: '2026-09-07',
        updatedAt: '2026-09-07',
      },
    ] as unknown as AppData['highlights'],
    removedNotes: { [`${CANARY}|3`]: '2026-09-01' },
    prefs: { remindersEnabled: true, reminderTime: `${CANARY}` } as unknown as AppData['prefs'],
  };
}

function publish(visibility: Visibility = 'reading', data = loadedJournal()) {
  return projectProgress({ data, streak, overall, visibility, now: new Date('2026-09-07T15:00:00Z') });
}

describe('projectProgress is a whitelist', () => {
  /*
   * The pin that matters more than every other one here. A note reaching the
   * server is not a bug anybody would notice from inside the app: the screen
   * looks right, sync still works, and the only symptom is that somebody else
   * can read your journal. So the assertion is not "the right fields are
   * present", it is "the private ones are absent", tested by serialising the
   * whole row and searching it.
   */
  it('lets nothing private out, however deep it was buried', () => {
    const row = publish();
    expect(JSON.stringify(row)).not.toContain(CANARY);
  });

  it('publishes these fields and no others', () => {
    // Fails the day this file grows a field, which is the point: adding one has
    // to be a deliberate edit here rather than something that rides along.
    expect(Object.keys(publish()).sort()).toEqual([...PUBLISHED_KEYS].sort());
  });

  it('carries the figures a friend card actually shows', () => {
    const row = publish();
    expect(row.streak_current).toBe(12);
    expect(row.streak_longest).toBe(30);
    expect(row.chapters_read).toBe(412);
    expect(row.books_done).toBe(9);
    expect(row.plan_id).toBe('full_arc');
    expect(row.plan_percent).toBe(31);
    expect(row.last_read_day).toBe('2026-09-07');
  });

  it('names the chapter last marked, not the one read longest ago', () => {
    const row = publish();
    expect(row.current_book).toBe('John');
    expect(row.current_chapter).toBe(3);
  });

  it('does not report a chapter that has since been cleared', () => {
    // markedAt keeps a stamp after a chapter is unmarked, so the newest stamp
    // is not on its own an answer to "what are they reading".
    const data = loadedJournal();
    delete data.read['John|3'];
    const row = projectProgress({ data, streak, overall, visibility: 'reading' });
    expect(row.current_book).toBe('Job');
    expect(row.current_chapter).toBe(12);
  });
});

describe('quiet publishes the dot and nothing else', () => {
  it('nulls every number while keeping the day', () => {
    const row = publish('quiet');
    expect(row.last_read_day).toBe('2026-09-07');
    for (const key of PUBLISHED_KEYS) {
      if (key === 'last_read_day' || key === 'tz_offset') continue;
      expect(row[key], `${key} should be null when quiet`).toBeNull();
    }
  });

  it('still lets nothing private out', () => {
    expect(JSON.stringify(publish('quiet'))).not.toContain(CANARY);
  });
});

describe('a friend has their own today', () => {
  it('counts minutes east of UTC, the opposite sign to getTimezoneOffset', () => {
    // A date whose offset the test host cannot change, so this checks the flip
    // rather than a particular zone.
    const now = new Date('2026-09-07T15:00:00Z');
    expect(tzOffsetMinutes(now)).toBe(-now.getTimezoneOffset());
  });

  it('is already tomorrow in Tokyo late in a UTC evening', () => {
    const now = new Date('2026-09-07T20:00:00Z');
    expect(theirToday(540, now)).toBe('2026-09-08');
    expect(theirToday(0, now)).toBe('2026-09-07');
    expect(theirToday(-300, now)).toBe('2026-09-07');
  });

  it('is still yesterday in New York early in a UTC morning', () => {
    const now = new Date('2026-09-07T03:00:00Z');
    expect(theirToday(-300, now)).toBe('2026-09-06');
    expect(theirToday(540, now)).toBe('2026-09-07');
  });

  it('handles the offsets that are not whole hours', () => {
    const now = new Date('2026-09-07T18:20:00Z');
    // Kathmandu is +5:45, so it is already past midnight there.
    expect(theirToday(345, now)).toBe('2026-09-08');
    expect(theirToday(330, now)).toBe('2026-09-07');
  });

  /*
   * The dot this is all for. Computing it against the *reader's* midnight is
   * the obvious implementation and it is wrong for most of the day for anyone
   * far enough away, which would make the one honest thing on a friend card
   * quietly untrue.
   */
  it('says a Tokyo friend read today when their own day says so', () => {
    const now = new Date('2026-09-07T20:00:00Z');
    expect(readToday({ last_read_day: '2026-09-08', tz_offset: 540 }, now)).toBe(true);
    // The same day key would be yesterday for someone sitting in UTC.
    expect(readToday({ last_read_day: '2026-09-08', tz_offset: 0 }, now)).toBe(false);
  });

  it('never claims a reader who has never read', () => {
    expect(readToday({ last_read_day: null, tz_offset: 0 })).toBe(false);
  });
});

describe('a friend card says only what is still true', () => {
  const now = new Date('2026-09-07T15:00:00Z');
  const base = { tz_offset: 0, current_book: 'Luke', current_chapter: 9 };

  it('shows a live streak', () => {
    const p = presenceOf({ ...base, last_read_day: '2026-09-07', streak_current: 23 }, now);
    expect(p.today).toBe(true);
    expect(p.streak).toBe(23);
    expect(p.where).toBe('Luke 9');
  });

  it('still trusts a streak from yesterday, since they may not have opened the app', () => {
    const p = presenceOf({ ...base, last_read_day: '2026-09-06', streak_current: 23 }, now);
    expect(p.today).toBe(false);
    expect(p.daysSince).toBe(1);
    expect(p.streak).toBe(23);
  });

  /*
   * The decision this whole function exists for. A published row is only
   * rewritten when that reader opens the app, so a streak of twelve can sit on
   * the server long after it broke. Printing it invents a streak on somebody's
   * behalf; printing a nought puts a scoreboard's worst number on a person
   * having a hard month, on a screen they can see.
   */
  it('prints no streak at all for someone who has lapsed', () => {
    const p = presenceOf({ ...base, last_read_day: '2026-09-03', streak_current: 12 }, now);
    expect(p.streak).toBeNull();
    expect(p.daysSince).toBe(4);
  });

  it('prints no streak for a broken one either, rather than a nought', () => {
    const p = presenceOf({ ...base, last_read_day: '2026-09-03', streak_current: 0 }, now);
    expect(p.streak).toBeNull();
  });

  it('says nothing about someone who has never read', () => {
    const p = presenceOf({ ...base, last_read_day: null, streak_current: null }, now);
    expect(p).toEqual({ today: false, daysSince: null, streak: null, where: null });
  });

  it('handles a quiet friend, who publishes a day and nothing else', () => {
    const p = presenceOf(
      { last_read_day: '2026-09-07', tz_offset: 60, streak_current: null, current_book: null, current_chapter: null },
      now,
    );
    expect(p.today).toBe(true);
    expect(p.streak).toBeNull();
    expect(p.where).toBeNull();
  });

  it('counts the days in their timezone, not yours', () => {
    // 20:00 UTC is already the 8th in Tokyo, so a Tokyo friend whose last day
    // is the 8th read today, and one whose last day is the 7th read yesterday.
    const late = new Date('2026-09-07T20:00:00Z');
    expect(presenceOf({ ...base, tz_offset: 540, last_read_day: '2026-09-08', streak_current: 3 }, late).today).toBe(true);
    expect(presenceOf({ ...base, tz_offset: 540, last_read_day: '2026-09-07', streak_current: 3 }, late).daysSince).toBe(1);
  });

  it('never reports a negative gap when their day runs ahead', () => {
    const p = presenceOf({ ...base, tz_offset: 540, last_read_day: '2026-09-09', streak_current: 3 }, now);
    expect(p.daysSince).toBe(0);
    expect(p.today).toBe(true);
  });

  it('copes with no progress row at all, which is what pending gives back', () => {
    expect(presenceOf(null, now)).toEqual({
      today: false,
      daysSince: null,
      streak: null,
      where: null,
    });
  });
});

describe('canonicalPair matches how the table stores a pair', () => {
  const one = '00000000-0000-4000-8000-00000000000a';
  const two = 'ffffffff-0000-4000-8000-00000000000f';

  it('gives the same row whichever way round it is asked', () => {
    expect(canonicalPair(one, two)).toEqual(canonicalPair(two, one));
  });

  it('puts the lower id first, which is the check constraint', () => {
    expect(canonicalPair(two, one)).toEqual({ user_a: one, user_b: two });
  });

  /*
   * Postgres compares uuids by their bytes. A lowercase hyphenated uuid sorts
   * identically as a string, since '0' to '9' precedes 'a' to 'f' in ASCII
   * exactly as it does in hex. Uppercase does not: 'A' is 65 and 'a' is 97, so
   * a capitalised id sorts to the wrong side and would write a second row for a
   * pair that already had one, which the primary key would then reject.
   */
  it('lowercases first, so a capitalised id cannot sort to the wrong side', () => {
    expect(canonicalPair(two.toUpperCase(), one)).toEqual({ user_a: one, user_b: two });
    expect(canonicalPair('ABCDEF00-0000-4000-8000-00000000000a', two).user_a).toBe(
      'abcdef00-0000-4000-8000-00000000000a',
    );
  });
});

describe('handles', () => {
  it('accepts what the check constraint accepts', () => {
    expect(isValidHandle('charbel')).toBe(true);
    expect(isValidHandle('a_reader_99')).toBe(true);
    expect(isValidHandle('Charbel')).toBe(true);
  });

  it('rejects what the check constraint rejects', () => {
    expect(isValidHandle('ab')).toBe(false);
    expect(isValidHandle('a'.repeat(21))).toBe(false);
    expect(isValidHandle('has space')).toBe(false);
    expect(isValidHandle('has-hyphen')).toBe(false);
    expect(isValidHandle('email@example.com')).toBe(false);
  });

  it('stores lowercase rather than merely accepting it', () => {
    expect(normalizeHandle('  Charbel  ')).toBe('charbel');
  });
});

describe('suggestHandle fills the form in from what Google already told us', () => {
  it('offers the first name where that is enough', () => {
    expect(suggestHandle('Charbel John Dagher')).toBe('charbel');
    expect(suggestHandle('Ruth')).toBe('ruth');
  });

  it('takes more of the name only when it has to', () => {
    // "Jo" alone is two characters and the constraint wants three.
    expect(suggestHandle('Jo Nguyen')).toBe('jonguyen');
    expect(suggestHandle('Al B Carter')).toBe('alb');
  });

  it('folds accents rather than dropping them', () => {
    // Stripping the mark outright would suggest "jos", which is somebody else.
    expect(suggestHandle('José Álvarez')).toBe('jose');
    expect(suggestHandle('Zoë')).toBe('zoe');
  });

  it('drops anything a handle cannot contain', () => {
    expect(suggestHandle("O'Brien")).toBe('obrien');
    // A hyphenated first name is one name, so it is not cut at the hyphen.
    expect(suggestHandle('Mary-Anne Smith')).toBe('maryanne');
  });

  it('never suggests something the constraint would reject', () => {
    for (const name of ['Charbel John Dagher', 'José Álvarez', 'Jo Nguyen', "O'Brien", 'Zoë']) {
      expect(isValidHandle(suggestHandle(name)), name).toBe(true);
    }
  });

  it('gives back nothing rather than inventing a name nobody chose', () => {
    expect(suggestHandle('')).toBe('');
    expect(suggestHandle('Al')).toBe('');
    expect(suggestHandle('...')).toBe('');
  });

  it('never suggests one longer than the column allows', () => {
    expect(suggestHandle('Bartholomew Featherstonehaugh').length).toBeLessThanOrEqual(20);
  });
});

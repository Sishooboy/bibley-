import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getTrack, type PhasedTrack } from '../data/tracks';

/** The three story-first tracks, which is what the old plan ids became. */
const STORY = ['full_story_first', 'nt_story_first', 'ot_story_first'] as const;
const track = (id: string) => getTrack(id) as PhasedTrack;
import { addDays, clampReadingDay, daysBetween, isDayKey, toDayKey, today } from './dates';
import {
  last30Days,
  nextUnread,
  overallProgress,
  phaseProgressAll,
  REST_CAP,
  streak,
  streakRisk,
} from './progress';
import type { ReadMap } from './storage';

/** Streaks are relative to "now", so the clock has to be pinned to test them. */
function freezeAt(iso: string) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(iso));
}

describe('dates', () => {
  it('keeps day keys in local time, not UTC', () => {
    // Late evening local time is already tomorrow in UTC. The key must not slip.
    const d = new Date(2026, 1, 3, 23, 30);
    expect(toDayKey(d)).toBe('2026-02-03');
  });

  it('crosses month and year boundaries', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('counts whole days between keys', () => {
    expect(daysBetween('2026-02-01', '2026-02-08')).toBe(7);
    expect(daysBetween('2026-02-08', '2026-02-01')).toBe(-7);
  });

  it('survives a daylight saving change', () => {
    // Most northern DST shifts land in March. A 23 or 25 hour day still counts as one.
    expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2);
  });
});

describe('choosing a reading day', () => {
  it('accepts a real date and keeps it', () => {
    expect(clampReadingDay('2026-02-08', '2026-02-10')).toBe('2026-02-08');
  });

  it('accepts a date years back, since catching up is the point', () => {
    expect(clampReadingDay('2019-07-04', '2026-02-10')).toBe('2019-07-04');
  });

  /*
   * A future reading day would keep a streak alive without anyone reading:
   * `streak` measures the gap from the last day read to today, and a day ahead
   * of today makes that gap negative.
   */
  it('refuses a day in the future', () => {
    expect(clampReadingDay('2026-03-01', '2026-02-10')).toBe('2026-02-10');
    expect(clampReadingDay('2026-02-11', '2026-02-10')).toBe('2026-02-10');
  });

  it('allows today itself', () => {
    expect(clampReadingDay('2026-02-10', '2026-02-10')).toBe('2026-02-10');
  });

  it('falls back to today for anything that is not a date', () => {
    for (const bad of ['', 'yesterday', '2026-2-8', '10-02-2026', null, undefined, 42, {}]) {
      expect(clampReadingDay(bad, '2026-02-10')).toBe('2026-02-10');
    }
  });

  it('rejects a date that looks right but does not exist', () => {
    // A Date object silently rolls 31 February into March, so the shape of the
    // string is not enough on its own.
    expect(clampReadingDay('2026-02-31', '2026-06-10')).toBe('2026-06-10');
    expect(clampReadingDay('2026-13-01', '2026-06-10')).toBe('2026-06-10');
    expect(isDayKey('2026-02-29')).toBe(false);
    expect(isDayKey('2028-02-29')).toBe(true);
  });
});

describe('streak', () => {
  beforeEach(() => freezeAt('2026-02-10T09:00:00'));
  afterEach(() => vi.useRealTimers());

  it('is zero with nothing read', () => {
    expect(streak({}).current).toBe(0);
    expect(streak({}).lastReadDay).toBeNull();
  });

  it('counts consecutive days up to today', () => {
    const read: ReadMap = { a: '2026-02-08', b: '2026-02-09', c: '2026-02-10' };
    expect(streak(read).current).toBe(3);
  });

  it('survives a day where nothing has been read yet', () => {
    // Read through yesterday, nothing today. Today is not over, so it stands.
    const read: ReadMap = { a: '2026-02-08', b: '2026-02-09' };
    expect(streak(read).current).toBe(2);
  });

  it('dies after a full missed day', () => {
    const read: ReadMap = { a: '2026-02-07', b: '2026-02-08' };
    expect(streak(read).current).toBe(0);
  });

  it('remembers the longest run even after it breaks', () => {
    const read: ReadMap = {
      a: '2026-01-01',
      b: '2026-01-02',
      c: '2026-01-03',
      d: '2026-01-04',
      e: '2026-02-10',
    };
    const result = streak(read);
    expect(result.longest).toBe(4);
    expect(result.current).toBe(1);
  });

  it('counts a day once however many chapters it holds', () => {
    const read: ReadMap = { a: '2026-02-09', b: '2026-02-09', c: '2026-02-10' };
    expect(streak(read).current).toBe(2);
  });

  it('ignores chapters with no day, which came from an import', () => {
    const read: ReadMap = { a: null, b: '2026-02-10' };
    expect(streak(read).current).toBe(1);
  });
});

/**
 * Rest days are the stake. They are earned by reading, they run out, and they
 * are derived from the days rather than stored, so there is no balance to drift
 * between two devices. These pin the arithmetic, because every one of them is a
 * rule a reader will feel and none of them is visible in the UI until it bites.
 */
describe('rest days', () => {
  beforeEach(() => freezeAt('2026-02-10T09:00:00'));
  afterEach(() => vi.useRealTimers());

  /** Read on each of the given days, one chapter apiece. */
  const on = (...days: string[]): ReadMap =>
    Object.fromEntries(days.map((d, i) => [`Book|${i + 1}`, d]));

  const range = (from: number, to: number) =>
    Array.from({ length: to - from + 1 }, (_, i) => `2026-02-${String(from + i).padStart(2, '0')}`);

  it('earns nothing in the first six days', () => {
    expect(streak(on(...range(5, 10))).rest).toBe(0);
  });

  it('earns one on the seventh day read', () => {
    expect(streak(on(...range(4, 10))).rest).toBe(1);
  });

  it('holds no more than two, however long the run', () => {
    // Twenty-eight days running up to today, which would earn four uncapped.
    const jan = Array.from({ length: 18 }, (_, i) => `2026-01-${14 + i}`);
    const s = streak(on(...jan, ...range(1, 10)));
    expect(s.current).toBe(28);
    expect(s.rest).toBe(REST_CAP);
  });

  /*
   * The heart of it. Seven days earns a rest day, and a single missed day then
   * costs it rather than ending the run. Before this, one bad Tuesday threw
   * away a month.
   */
  it('covers a missed day, and the run carries on', () => {
    // 3rd to 9th is seven days, then the 10th is missed... but today IS the 10th,
    // and today is never counted as missed, so use a gap inside the history.
    const read = on(...range(1, 7), '2026-02-09', '2026-02-10');
    const s = streak(read);
    expect(s.current).toBe(9);
    expect(s.rest).toBe(0);
  });

  it('counts days read, so a covered day never inflates the number', () => {
    // Nine days appear in the journal; the 8th was missed and covered.
    const s = streak(on(...range(1, 7), '2026-02-09', '2026-02-10'));
    expect(s.current).toBe(9);
  });

  it('breaks when the cover runs out', () => {
    // Six days earns nothing, so the missed 8th ends it and the 9th starts over.
    const s = streak(on(...range(2, 7), '2026-02-09', '2026-02-10'));
    expect(s.current).toBe(2);
  });

  it('needs two in hand for a two day absence', () => {
    // Seven days earns one, which cannot cover both the 8th and the 9th.
    expect(streak(on(...range(1, 7), '2026-02-10')).current).toBe(1);
    // Fourteen earns two, which can. Both absences end on today, so the gap to
    // now costs nothing and the only thing under test is the cover itself.
    const jan = Array.from({ length: 7 }, (_, i) => `2026-01-${25 + i}`);
    expect(streak(on(...jan, ...range(1, 7), '2026-02-10')).current).toBe(15);
  });

  it('loses unspent rest days when the run ends', () => {
    // A fortnight, then a three day absence no cover can bridge, then one day.
    const before = range(20, 31).map((d) => d.replace('02-', '01-')).concat(range(1, 2));
    expect(streak(on(...before, '2026-02-10')).current).toBe(1);
  });

  /*
   * Today is never a missed day: it is not over. A reader who read yesterday and
   * has not opened the app yet still has their streak, and it has cost nothing.
   */
  it('does not spend anything on a today that is merely unread', () => {
    const s = streak(on(...range(3, 9)));
    expect(s.current).toBe(7);
    expect(s.rest).toBe(1);
    expect(s.resting).toBe(false);
  });

  it('says when a rest day is what is holding it up', () => {
    // Read through the 8th, nothing on the 9th, and today is the 10th.
    const s = streak(on(...range(2, 8)));
    expect(s.current).toBe(7);
    expect(s.resting).toBe(true);
    expect(s.rest).toBe(0);
  });

  /*
   * `lastRun` is what a broken streak was, which is the only way the app can
   * say what was lost. `current` goes to zero; this does not.
   */
  it('remembers the size of a run that has ended', () => {
    const s = streak(on(...range(1, 5)));
    expect(s.current).toBe(0);
    expect(s.lastRun).toBe(5);
    expect(s.rest).toBe(0);
  });

  it('has nothing to report for an empty journal', () => {
    expect(streak({})).toEqual({
      current: 0,
      longest: 0,
      lastReadDay: null,
      rest: 0,
      resting: false,
      lastRun: 0,
    });
  });
});

describe('streakRisk', () => {
  const s = (over: Partial<ReturnType<typeof streak>> = {}) => ({
    current: 12,
    longest: 12,
    lastReadDay: '2026-02-09',
    rest: 0,
    resting: false,
    lastRun: 12,
    ...over,
  });
  const at = (hour: number) => new Date(2026, 1, 10, hour, 0);

  it('says nothing once today has been read', () => {
    expect(streakRisk(s(), true, at(22))).toBeNull();
  });

  it('says nothing when there is no streak to lose', () => {
    expect(streakRisk(s({ current: 0 }), false, at(22))).toBeNull();
  });

  it('is calm in the morning and urgent at night', () => {
    expect(streakRisk(s(), false, at(9))?.level).toBe('calm');
    expect(streakRisk(s(), false, at(21))?.level).toBe('urgent');
  });

  /*
   * The honesty rule. With a rest day in hand the streak does *not* end tonight,
   * so saying it does would be a threat the app gets caught inventing, and the
   * next warning would be worth nothing.
   */
  it('never threatens an ending a rest day would prevent', () => {
    const late = streakRisk(s({ rest: 1 }), false, at(23));
    expect(late?.level).toBe('due');
    expect(late?.text).not.toContain('ends tonight');
    expect(late?.text).toContain('rest day');
  });

  it('names the number, so the thing at stake is on screen', () => {
    expect(streakRisk(s(), false, at(21))?.text).toContain('12 day streak');
  });
});

describe('last30Days', () => {
  beforeEach(() => freezeAt('2026-02-10T09:00:00'));
  afterEach(() => vi.useRealTimers());

  it('fills gaps with zeroes and ends on today', () => {
    const window = last30Days({ a: '2026-02-10', b: '2026-02-10', c: '2026-02-08' });
    expect(window).toHaveLength(30);
    expect(window[29]).toEqual({ day: today(), chapters: 2 });
    expect(window[28]).toEqual({ day: '2026-02-09', chapters: 0 });
    expect(window[27]).toEqual({ day: '2026-02-08', chapters: 1 });
  });
});

describe('plan progress', () => {
  it('counts a chapter under whichever plans contain its book', () => {
    // John is in the whole Bible and the New Testament, not the Old.
    const read: ReadMap = { 'John|1': '2026-02-01' };
    for (const id of STORY) {
      const plan = track(id);
      const overall = overallProgress(phaseProgressAll(read, plan), plan);
      expect(overall.planRead).toBe(id === 'ot_story_first' ? 0 : 1);
    }
  });

  it('leaves chapters outside the plan stored but uncounted', () => {
    // This is what makes switching tracks safe: a track is a view, not a
    // container. Reading Genesis on one track still counts on every other track
    // that contains Genesis.
    const read: ReadMap = { 'John|1': '2026-02-01', 'Genesis|1': '2026-02-01' };
    const ot = track('ot_story_first');
    const overall = overallProgress(phaseProgressAll(read, ot), ot);

    expect(overall.planRead).toBe(1);
    expect(Object.keys(read)).toHaveLength(2);
  });

  /*
   * The loop breaks on `out.length === count`, which a zero never satisfies, so
   * without the guard at the top this returns the whole track and marking "no
   * chapters" reads the entire Bible.
   */
  it('returns nothing when no chapters are asked for', () => {
    const plan = track('full_story_first');
    expect(nextUnread({}, 0, plan)).toEqual([]);
    expect(nextUnread({}, -1, plan)).toEqual([]);
    expect(nextUnread({}, 1, plan)).toHaveLength(1);
  });

  it('marks a book done only when every chapter is read', () => {
    const plan = track('nt_story_first');
    const jude = plan.phases.flatMap((p) => p.books).find((b) => b.name === 'Jude');
    expect(jude).toBeDefined();

    const read: ReadMap = {};
    for (let c = 1; c <= jude!.chapters; c++) read[`Jude|${c}`] = '2026-02-01';

    expect(overallProgress(phaseProgressAll(read, plan), plan).booksDone).toBe(1);
  });
});

describe('the tracks themselves', () => {
  it('has the counts the app states out loud', () => {
    expect([track('full_story_first').bookCount, track('full_story_first').chapterCount]).toEqual([
      73, 1334,
    ]);
    expect([track('nt_story_first').bookCount, track('nt_story_first').chapterCount]).toEqual([
      27, 260,
    ]);
    expect([track('ot_story_first').bookCount, track('ot_story_first').chapterCount]).toEqual([
      46, 1074,
    ]);
  });

  it('splits the whole Bible exactly between the two testaments', () => {
    const names = (id: string) =>
      track(id)
        .books.map((b) => b.name)
        .sort();

    expect([...names('nt_story_first'), ...names('ot_story_first')].sort()).toEqual(
      names('full_story_first'),
    );
  });

  it('lists every chapter of every book exactly once in the sequence', () => {
    for (const id of STORY) {
      const plan = track(id);
      const keys = plan.sequence.map((r) => `${r.book}|${r.chapter}`);
      expect(keys).toHaveLength(plan.chapterCount);
      expect(new Set(keys).size).toBe(plan.chapterCount);
    }
  });

  it('never repeats a book name, which is what makes chapter keys work', () => {
    const names = track('full_story_first').books.map((b) => b.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PLANS, PLAN_ORDER } from '../data/plans';
import { addDays, clampReadingDay, daysBetween, isDayKey, toDayKey, today } from './dates';
import { last30Days, overallProgress, phaseProgressAll, streak } from './progress';
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
    expect(streak({})).toEqual({ current: 0, longest: 0, lastReadDay: null });
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
    for (const id of PLAN_ORDER) {
      const plan = PLANS[id];
      const overall = overallProgress(phaseProgressAll(read, plan), plan);
      expect(overall.planRead).toBe(id === 'ot' ? 0 : 1);
    }
  });

  it('leaves chapters outside the plan stored but uncounted', () => {
    // This is what makes switching plans safe: a plan is a view, not a container.
    const read: ReadMap = { 'John|1': '2026-02-01', 'Genesis|1': '2026-02-01' };
    const ot = PLANS.ot;
    const overall = overallProgress(phaseProgressAll(read, ot), ot);

    expect(overall.planRead).toBe(1);
    expect(Object.keys(read)).toHaveLength(2);
  });

  it('marks a book done only when every chapter is read', () => {
    const plan = PLANS.nt;
    const jude = plan.phases.flatMap((p) => p.books).find((b) => b.name === 'Jude');
    expect(jude).toBeDefined();

    const read: ReadMap = {};
    for (let c = 1; c <= jude!.chapters; c++) read[`Jude|${c}`] = '2026-02-01';

    expect(overallProgress(phaseProgressAll(read, plan), plan).booksDone).toBe(1);
  });
});

describe('the plans themselves', () => {
  it('has the counts the app states out loud', () => {
    expect([PLANS.both.bookCount, PLANS.both.chapterCount]).toEqual([66, 1189]);
    expect([PLANS.nt.bookCount, PLANS.nt.chapterCount]).toEqual([27, 260]);
    expect([PLANS.ot.bookCount, PLANS.ot.chapterCount]).toEqual([39, 929]);
  });

  it('splits the whole Bible exactly between the two testaments', () => {
    const names = (id: (typeof PLAN_ORDER)[number]) =>
      PLANS[id].phases.flatMap((p) => p.books.map((b) => b.name)).sort();

    expect([...names('nt'), ...names('ot')].sort()).toEqual(names('both'));
  });

  it('lists every chapter of every book exactly once in the sequence', () => {
    for (const id of PLAN_ORDER) {
      const plan = PLANS[id];
      const keys = plan.sequence.map((r) => `${r.book}|${r.chapter}`);
      expect(keys).toHaveLength(plan.chapterCount);
      expect(new Set(keys).size).toBe(plan.chapterCount);
    }
  });

  it('never repeats a book name, which is what makes chapter keys work', () => {
    const names = PLANS.both.phases.flatMap((p) => p.books.map((b) => b.name));
    expect(new Set(names).size).toBe(names.length);
  });
});

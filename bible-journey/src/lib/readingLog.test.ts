import { describe, expect, it } from 'vitest';
import { bookLog, recentDays, summariseRuns } from './readingLog';
import type { ReadMap } from './storage';

describe('summariseRuns', () => {
  it('collapses a run into a range', () => {
    expect(summariseRuns([6, 7, 8, 9])).toBe('6-9');
  });

  it('keeps separate runs separate', () => {
    expect(summariseRuns([1, 3, 4, 5, 9])).toBe('1, 3-5, 9');
  });

  it('names a single chapter plainly', () => {
    expect(summariseRuns([12])).toBe('12');
  });

  it('does not care what order they arrive in', () => {
    expect(summariseRuns([9, 3, 4, 1, 5])).toBe('1, 3-5, 9');
  });

  it('has nothing to say about nothing', () => {
    expect(summariseRuns([])).toBe('');
  });
});

describe('bookLog', () => {
  const read: ReadMap = {
    'John|1': '2026-02-01',
    'John|2': '2026-02-01',
    'John|3': '2026-02-05',
    'John|7': '2026-02-05',
    'Mark|1': '2026-02-03',
  };

  it('groups a book by the day each chapter was read, newest first', () => {
    const log = bookLog(read, 'John', 21);
    expect(log.map((e) => [e.day, e.label])).toEqual([
      ['2026-02-05', '3, 7'],
      ['2026-02-01', '1-2'],
    ]);
  });

  it('leaves other books out of it', () => {
    expect(bookLog(read, 'John', 21).flatMap((e) => e.chapters)).toEqual([3, 7, 1, 2]);
  });

  it('says nothing for a book with nothing read', () => {
    expect(bookLog(read, 'Luke', 24)).toEqual([]);
  });

  it('gathers imported chapters with no day rather than guessing one', () => {
    const imported: ReadMap = { 'John|1': null, 'John|2': '2026-02-01' };
    const log = bookLog(imported, 'John', 21);
    expect(log[log.length - 1]).toEqual({ day: '', chapters: [1], label: '1' });
  });
});

describe('recentDays', () => {
  const read: ReadMap = {
    'John|1': '2026-02-01',
    'John|2': '2026-02-01',
    'Mark|4': '2026-02-01',
    'Luke|9': '2026-02-08',
  };

  it('lists days newest first, with what was read on each', () => {
    const days = recentDays(read);
    expect(days[0]).toEqual({
      day: '2026-02-08',
      total: 1,
      books: [{ book: 'Luke', label: '9' }],
    });
    expect(days[1]).toEqual({
      day: '2026-02-01',
      total: 3,
      books: [
        { book: 'John', label: '1-2' },
        { book: 'Mark', label: '4' },
      ],
    });
  });

  it('splits a numbered book name on the right pipe', () => {
    // "1 Samuel|3" has to become 1 Samuel chapter 3, not a book called "1".
    const days = recentDays({ '1 Samuel|3': '2026-02-01' });
    expect(days[0].books).toEqual([{ book: '1 Samuel', label: '3' }]);
  });

  it('ignores chapters with no day, which came from an import', () => {
    expect(recentDays({ 'John|1': null })).toEqual([]);
  });

  it('stops at the limit asked for', () => {
    const many: ReadMap = {};
    for (let d = 1; d <= 20; d++) many[`John|${d}`] = `2026-03-${String(d).padStart(2, '0')}`;
    expect(recentDays(many, 5)).toHaveLength(5);
    expect(recentDays(many, 5)[0].day).toBe('2026-03-20');
  });
});

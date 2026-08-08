import { describe, expect, it } from 'vitest';
import { PLANS } from '../data/plans';
import { overallProgress, pace, phaseProgressAll, streak } from './progress';
import { buildShareStats, describeCard } from './shareCard';
import type { AppData, ReadMap } from './storage';

function journal(read: ReadMap, over: Partial<AppData> = {}): AppData {
  return { version: 1, planId: 'both', read, notes: [], startedAt: '2026-01-01', ...over };
}

function statsFor(data: AppData) {
  const plan = PLANS[data.planId ?? 'both'];
  const phases = phaseProgressAll(data.read, plan);
  const overall = overallProgress(phases, plan);
  return buildShareStats(data, plan, overall, streak(data.read), pace(data.read, overall.planRead, plan));
}

describe('buildShareStats', () => {
  it('ranks the most read books, with their real totals', () => {
    const read: ReadMap = {};
    for (let c = 1; c <= 12; c++) read[`John|${c}`] = '2026-02-01';
    for (let c = 1; c <= 5; c++) read[`Mark|${c}`] = '2026-02-01';
    read['Jude|1'] = '2026-02-01';

    const top = statsFor(journal(read)).topBooks;
    expect(top).toEqual([
      { name: 'John', read: 12, total: 21 },
      { name: 'Mark', read: 5, total: 16 },
      { name: 'Jude', read: 1, total: 1 },
    ]);
  });

  it('shows at most three books', () => {
    const read: ReadMap = {};
    for (const book of ['John', 'Mark', 'Luke', 'Acts', 'Romans']) read[`${book}|1`] = '2026-02-01';
    expect(statsFor(journal(read)).topBooks).toHaveLength(3);
  });

  it('leaves chapters outside the plan out of the count', () => {
    // Genesis is stored but the New Testament plan does not contain it, and a
    // card about this plan should not quietly include it.
    const read: ReadMap = { 'John|1': '2026-02-01', 'Genesis|1': '2026-02-01' };
    const stats = statsFor(journal(read, { planId: 'nt' }));

    expect(stats.topBooks.map((b) => b.name)).toEqual(['John']);
    expect(stats.chaptersRead).toBe(1);
  });

  it('handles a book name containing the key separator safely', () => {
    // "1 Samuel" splits on the last pipe, not the first, so numbered books work.
    const read: ReadMap = { '1 Samuel|3': '2026-02-01', '2 Kings|1': '2026-02-01' };
    const names = statsFor(journal(read)).topBooks.map((b) => b.name);
    expect(names).toContain('1 Samuel');
    expect(names).toContain('2 Kings');
  });

  it('names the time of day read most, and stays quiet when none was tagged', () => {
    const read: ReadMap = { 'John|1': '2026-02-01', 'John|2': '2026-02-01', 'John|3': '2026-02-01' };

    expect(statsFor(journal(read)).favouriteSlot).toBeNull();

    const tagged = journal(read, {
      slots: { 'John|1': 'night', 'John|2': 'night', 'John|3': 'morning' },
    });
    expect(statsFor(tagged).favouriteSlot).toBe('night');
  });

  it('survives an empty journal without inventing anything', () => {
    const stats = statsFor(journal({}));

    expect(stats.chaptersRead).toBe(0);
    expect(stats.percent).toBe(0);
    expect(stats.topBooks).toEqual([]);
    expect(stats.favouriteSlot).toBeNull();
    expect(() => describeCard(stats)).not.toThrow();
  });

  it('describes itself for anyone who cannot see the picture', () => {
    const read: ReadMap = { 'John|1': '2026-02-01' };
    expect(describeCard(statsFor(journal(read)))).toMatch(
      /% of The whole Bible read, 1 of 1,334 chapters/,
    );
  });
});

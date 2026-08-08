import { describe, expect, it } from 'vitest';
import { PLANS } from '../data/plans';
import { overallProgress, pace, phaseProgressAll, streak } from './progress';
import { buildShareStats, describeCard, gridLayout } from './shareCard';
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
  it('leaves chapters outside the plan out of the count', () => {
    // Genesis is stored but the New Testament plan does not contain it, and a
    // card about this plan should not quietly include it.
    const read: ReadMap = { 'John|1': '2026-02-01', 'Genesis|1': '2026-02-01' };
    expect(statsFor(journal(read, { planId: 'nt' })).chaptersRead).toBe(1);
  });

  /*
   * The card draws one square per book. It used to chart the three most read,
   * which repeated the figures above it, and then quoted a highlight, which put
   * the reader's own annotations on something made to send to other people.
   */
  it('lists every book in the plan, in printed order', () => {
    const books = statsFor(journal({})).books;

    expect(books).toHaveLength(73);
    expect(books[0].name).toBe('Genesis');
    expect(books[books.length - 1].name).toBe('Revelation');
    // Printed order, not reading order, so the deuterocanon sits where a
    // Catholic Bible puts it rather than where the plan gets to it.
    expect(books.map((b) => b.name).indexOf('Tobit')).toBeLessThan(
      books.map((b) => b.name).indexOf('Job'),
    );
  });

  it('counts how far into each book the reader has got', () => {
    const read: ReadMap = {};
    for (let c = 1; c <= 21; c++) read[`John|${c}`] = '2026-02-01';
    for (let c = 1; c <= 5; c++) read[`Mark|${c}`] = '2026-02-01';

    const books = statsFor(journal(read)).books;
    expect(books.find((b) => b.name === 'John')).toEqual({ name: 'John', read: 21, total: 21 });
    expect(books.find((b) => b.name === 'Mark')).toEqual({ name: 'Mark', read: 5, total: 16 });
    expect(books.find((b) => b.name === 'Luke')).toEqual({ name: 'Luke', read: 0, total: 24 });
  });

  it('separates the books on the go from the ones finished', () => {
    const read: ReadMap = { 'Jude|1': '2026-02-01' };
    for (let c = 1; c <= 5; c++) read[`Mark|${c}`] = '2026-02-01';

    const stats = statsFor(journal(read));
    expect(stats.booksDone).toBe(1);
    expect(stats.booksStarted).toBe(1);
  });

  it('narrows to the plan, and keeps the numbered books whole', () => {
    // Genesis is stored but a New Testament card should not show it at all, and
    // "1 Samuel" splits on the last pipe so numbered books survive the count.
    const nt = statsFor(journal({ 'John|1': '2026-02-01', 'Genesis|1': '2026-02-01' }, { planId: 'nt' }));
    expect(nt.books).toHaveLength(27);
    expect(nt.books.some((b) => b.name === 'Genesis')).toBe(false);

    const both = statsFor(journal({ '1 Samuel|3': '2026-02-01' }));
    expect(both.books.find((b) => b.name === '1 Samuel')?.read).toBe(1);
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
    expect(stats.booksStarted).toBe(0);
    expect(stats.books.every((b) => b.read === 0)).toBe(true);
    expect(stats.favouriteSlot).toBeNull();
    expect(() => describeCard(stats)).not.toThrow();
  });

  it('describes itself for anyone who cannot see the picture', () => {
    const read: ReadMap = { 'John|1': '2026-02-01' };
    const said = describeCard(statsFor(journal(read)));

    expect(said).toMatch(/% of The whole Bible read, 1 of 1,334 chapters/);
    expect(said).toContain('1 of 73 books part read.');
  });
});

/**
 * The grid has to fit the space it is given whatever plan it is drawing, 73
 * books or 46 or 27. A grid that runs past the bottom of the card would print
 * over the footer rule, and one square per book is not something a constant can
 * be written for.
 */
describe('gridLayout', () => {
  const W = 912;

  const H = 196;

  it('fits inside the box it is given', () => {
    for (const count of [27, 46, 73]) {
      const grid = gridLayout(count, W, H);
      expect(grid.height).toBeLessThanOrEqual(H);
      expect(grid.width).toBeLessThanOrEqual(W);
      expect(grid.cols * grid.rows).toBeGreaterThanOrEqual(count);
    }
  });

  it('leaves no empty row, so the last row is always in use', () => {
    for (const count of [27, 46, 73]) {
      const grid = gridLayout(count, W, H);
      expect((grid.rows - 1) * grid.cols).toBeLessThan(count);
    }
  });

  it('keeps the squares square and worth seeing', () => {
    const grid = gridLayout(73, W, H);
    expect(grid.cell).toBeGreaterThan(30);
    expect(grid.rows).toBeLessThanOrEqual(5);
  });

  it('never asks for more columns than there are books', () => {
    const grid = gridLayout(3, W, H);
    expect(grid.cols).toBe(3);
    expect(grid.rows).toBe(1);
  });

  it('has nothing to lay out for nothing', () => {
    expect(gridLayout(0, W, H)).toEqual({ cols: 0, rows: 0, cell: 0, width: 0, height: 0 });
  });
});

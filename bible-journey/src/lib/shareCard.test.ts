import { describe, expect, it } from 'vitest';
import { PLANS } from '../data/plans';
import { overallProgress, pace, phaseProgressAll, streak } from './progress';
import { buildShareStats, describeCard, wrapText } from './shareCard';
import type { AppData, Highlight, ReadMap } from './storage';

function mark(over: Partial<Highlight> = {}): Highlight {
  return {
    id: 'h1',
    book: 'John',
    chapter: 3,
    from: { verse: 16, offset: 0 },
    to: { verse: 16, offset: 20 },
    text: 'For God so loved the world',
    createdAt: '2026-02-01T09:00:00.000Z',
    updatedAt: '2026-02-01T09:00:00.000Z',
    ...over,
  };
}

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
   * The card quotes a passage the reader marked. It used to chart their three
   * most-read books, which repeated the figures above it and made a slower job
   * of it.
   */
  it('quotes the most recently touched highlight', () => {
    const data = journal(
      {},
      {
        highlights: [
          mark({ id: 'a', updatedAt: '2026-02-01T09:00:00.000Z' }),
          mark({
            id: 'b',
            book: 'Psalms',
            chapter: 23,
            from: { verse: 1, offset: 0 },
            to: { verse: 2, offset: 9 },
            text: 'Yahweh is my shepherd',
            updatedAt: '2026-03-04T09:00:00.000Z',
          }),
        ],
      },
    );

    expect(statsFor(data).verse).toEqual({ text: 'Yahweh is my shepherd', ref: 'Psalms 23:1-2' });
  });

  it('takes the words but never the thought written beside them', () => {
    // The note is the reader's own, and this card is made to send to people.
    const data = journal({}, { highlights: [mark({ note: 'this wrecked me' })] });
    const verse = statsFor(data).verse;

    expect(verse?.text).toBe('For God so loved the world');
    expect(JSON.stringify(verse)).not.toContain('wrecked');
  });

  it('has no verse until there is a highlight to quote', () => {
    expect(statsFor(journal({ 'John|1': '2026-02-01' })).verse).toBeNull();
    expect(statsFor(journal({}, { highlights: [mark({ text: '  ' })] })).verse).toBeNull();
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
    expect(stats.verse).toBeNull();
    expect(stats.favouriteSlot).toBeNull();
    expect(() => describeCard(stats)).not.toThrow();
  });

  it('describes itself for anyone who cannot see the picture', () => {
    const read: ReadMap = { 'John|1': '2026-02-01' };
    expect(describeCard(statsFor(journal(read)))).toMatch(
      /% of The whole Bible read, 1 of 1,334 chapters/,
    );
    expect(describeCard(statsFor(journal(read, { highlights: [mark()] })))).toContain(
      'Quoting John 3:16.',
    );
  });
});

/**
 * Measured in characters rather than pixels, which is all the wrapping logic
 * cares about: it asks how wide a string is and compares. A canvas is not
 * needed to check where it decides to break.
 */
describe('wrapText', () => {
  const measure = (text: string) => text.length;

  it('breaks on words, never mid-word', () => {
    expect(wrapText(measure, 'the quick brown fox jumps', 12, 5)).toEqual([
      'the quick',
      'brown fox',
      'jumps',
    ]);
  });

  it('says so with an ellipsis when it runs out of lines', () => {
    const lines = wrapText(measure, 'one two three four five six seven', 9, 2);
    expect(lines).toHaveLength(2);
    expect(lines[1].endsWith('…')).toBe(true);
    expect(lines.every((l) => l.length <= 9)).toBe(true);
  });

  it('adds no ellipsis when everything fitted', () => {
    expect(wrapText(measure, 'all of it', 20, 3)).toEqual(['all of it']);
  });

  it('keeps a word longer than the line rather than losing it', () => {
    expect(wrapText(measure, 'Mahershalalhashbaz', 6, 2)).toEqual(['Mahershalalhashbaz']);
  });

  it('has nothing to say about nothing', () => {
    expect(wrapText(measure, '   ', 20, 3)).toEqual([]);
  });
});

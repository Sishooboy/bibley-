import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getTrack, tracksFor, type StreamTrack } from '../data/tracks';
import { reducer, type State } from '../state/reducer';
import { addDays } from './dates';
import { mixFinished, streamRefs, todaysMix, type Ref } from './mix';
import { chapterKey, type ReadMap } from './storage';

const mix = getTrack('blended_daily') as StreamTrack;
const stream = (id: string) => mix.streams.find((s) => s.id === id)!;
const ot = stream('ot');
const nt = stream('nt');
const psalm = stream('psalm');
const proverb = stream('proverb');

const DAY = '2026-11-14';
const START = '2026-11-01';
const key = (r: Ref) => chapterKey(r.book, r.chapter);
const readOn = (refs: Ref[], day: string): ReadMap => Object.fromEntries(refs.map((r) => [key(r), day]));

describe('the Daily Mix track', () => {
  it('is a streams track, offered with the whole Bible', () => {
    expect(mix.kind).toBe('streams');
    expect(tracksFor('both').map((t) => t.id)).toContain('blended_daily');
  });

  it('covers every book exactly once, which is what its two counted orders are together', () => {
    // The premise every plan-wide screen rests on: the journey, the book grid,
    // Stats and the share card all read these phases as they would any track's.
    const names = mix.books.map((b) => b.name);
    expect(names).toHaveLength(73);
    expect(new Set(names).size).toBe(73);
    expect(mix.chapterCount).toBe(1334);
    expect(mix.sequence).toHaveLength(1334);
  });

  it('takes its phases from the Old Testament order and then the New', () => {
    const otOrder = getTrack('ot_story_first');
    const ntOrder = getTrack('nt_story_first');
    expect(mix.phases.map((p) => p.title)).toEqual([
      ...otOrder.phases.map((p) => p.title),
      ...ntOrder.phases.map((p) => p.title),
    ]);
    expect(mix.phases.map((p) => p.phase)).toEqual(mix.phases.map((_, i) => i + 1));
  });

  it('lays each stream out from what it names', () => {
    expect(ot.sequence.slice(0, 2)).toEqual(
      getTrack('ot_story_first').sequence.slice(0, 2).map(({ book, chapter }) => ({ book, chapter })),
    );
    expect(nt.sequence).toHaveLength(260);
    expect(psalm.sequence).toHaveLength(150);
    expect(proverb.sequence).toHaveLength(31);
    expect(proverb.sequence.every((r) => r.book === 'Proverbs')).toBe(true);
  });
});

describe('an order', () => {
  it('asks for the next chapters not yet read', () => {
    expect(streamRefs(ot, {}, DAY, START)).toEqual(ot.sequence.slice(0, 3));
    expect(streamRefs(nt, {}, DAY, START)).toEqual(nt.sequence.slice(0, 1));
  });

  it('waits on a missed day rather than skipping ahead', () => {
    // Nothing read yesterday: the same three are there today, not the next three.
    const yesterday = streamRefs(ot, {}, addDays(DAY, -1), START);
    expect(streamRefs(ot, {}, DAY, START)).toEqual(yesterday);
  });

  it('holds still while it is being read', () => {
    const part = streamRefs(ot, {}, DAY, START);
    const read = readOn(part.slice(0, 1), DAY);
    expect(streamRefs(ot, read, DAY, START)).toEqual(part);
    const [today] = todaysMix(mix, read, DAY, START);
    expect(today.unread).toEqual(part.slice(1));
    expect(today.done).toBe(false);
  });

  it('moves on the next day', () => {
    const part = streamRefs(ot, {}, DAY, START);
    const read = readOn(part, DAY);
    expect(todaysMix(mix, read, DAY, START)[0].done).toBe(true);
    expect(streamRefs(ot, read, addDays(DAY, 1), START)).toEqual(ot.sequence.slice(3, 6));
  });

  it('leaves out a chapter recorded against an earlier day', () => {
    // Backdated: read "yesterday", so it was never part of today.
    const read = readOn(ot.sequence.slice(0, 1), addDays(DAY, -1));
    expect(streamRefs(ot, read, DAY, START)).toEqual(ot.sequence.slice(1, 4));
  });

  it('leaves out a chapter read before the journal began', () => {
    // An imported journal records those as null rather than as a day.
    const read: ReadMap = { [key(ot.sequence[0])]: null };
    expect(streamRefs(ot, read, DAY, START)).toEqual(ot.sequence.slice(1, 4));
  });

  it('runs across the end of one book into the next', () => {
    const firstBook = ot.sequence[0].book;
    const ofFirst = ot.sequence.filter((r) => r.book === firstBook);
    const read = readOn(ofFirst.slice(0, -1), addDays(DAY, -1));
    const part = streamRefs(ot, read, DAY, START);
    expect(part[0]).toEqual(ofFirst[ofFirst.length - 1]);
    expect(part[1].book).not.toBe(firstBook);
  });

  it('runs out, and the mix is finished when both orders have', () => {
    const read = readOn([...ot.sequence, ...nt.sequence], addDays(DAY, -1));
    const today = todaysMix(mix, read, DAY, START);
    expect(today[0].refs).toEqual([]);
    expect(today[1].refs).toEqual([]);
    // The psalm and the proverb carry on; they are not what finishing means.
    expect(today[2].refs).toHaveLength(1);
    expect(mixFinished(today)).toBe(true);
    expect(mixFinished(todaysMix(mix, {}, DAY, START))).toBe(false);
  });
});

describe('a cursor', () => {
  it('reads the proverb of the day of the month', () => {
    expect(streamRefs(proverb, {}, '2026-11-14', START)).toEqual([{ book: 'Proverbs', chapter: 14 }]);
    expect(streamRefs(proverb, {}, '2026-12-31', START)).toEqual([{ book: 'Proverbs', chapter: 31 }]);
    expect(streamRefs(proverb, {}, '2027-02-01', START)).toEqual([{ book: 'Proverbs', chapter: 1 }]);
  });

  it('walks the psalms a day at a time from the day the journal began', () => {
    expect(streamRefs(psalm, {}, START, START)).toEqual([{ book: 'Psalms', chapter: 1 }]);
    expect(streamRefs(psalm, {}, addDays(START, 22), START)).toEqual([{ book: 'Psalms', chapter: 23 }]);
    // And round again after the hundred and fiftieth.
    expect(streamRefs(psalm, {}, addDays(START, 150), START)).toEqual([{ book: 'Psalms', chapter: 1 }]);
  });

  it('treats a start in the future as the first day', () => {
    expect(streamRefs(psalm, {}, START, addDays(START, 3))).toEqual([{ book: 'Psalms', chapter: 1 }]);
  });

  it('moves with the date whatever was read', () => {
    // Nothing read at all for a week, and the psalm has still moved on a week.
    expect(streamRefs(psalm, {}, addDays(START, 7), START)).toEqual([{ book: 'Psalms', chapter: 8 }]);
  });

  it('counts as read if it was ever read, and never skips ahead to an unread one', () => {
    // Re-marking would move the day it was first read, which can shorten a
    // streak already earned, so an old reading is the answer.
    const read = { 'Psalms|14': '2026-03-02' };
    const today = todaysMix(mix, read, addDays(START, 13), START);
    expect(today[2].refs).toEqual([{ book: 'Psalms', chapter: 14 }]);
    expect(today[2].done).toBe(true);
  });
});

describe('marking a day of the mix', () => {
  const TODAY = '2026-02-10';
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-10T09:00:00'));
  });
  afterEach(() => vi.useRealTimers());

  const state = (read: ReadMap = {}): State => ({
    data: { version: 1, planId: 'blended_daily', read, notes: [], startedAt: '2026-01-01' },
    previous: null,
    cue: null,
  });

  it('marks chapters across books as one change, with one undo and one sound', () => {
    const refs = [
      { book: 'Genesis', chapter: 1 },
      { book: 'Matthew', chapter: 1 },
      { book: 'Psalms', chapter: 41 },
    ];
    const next = reducer(state({ 'Genesis|1': TODAY }), { type: 'markRefs', refs, day: TODAY, slot: null });
    expect(Object.keys(next.data.read).sort()).toEqual(['Genesis|1', 'Matthew|1', 'Psalms|41']);
    expect(next.previous?.label).toBe('Marked 3 chapters');
    expect(next.cue).toEqual({ id: 1, name: 'chapter' });
  });

  it('does nothing when there is nothing to mark', () => {
    const before = state({ 'Genesis|1': TODAY });
    expect(reducer(before, { type: 'markRefs', refs: [], day: TODAY, slot: null })).toBe(before);
  });

  it('is the plan the journal is on, not a quiet fallback to another', () => {
    // It used to resolve to The Full Arc, which is why it could not be offered.
    const next = reducer(state(), { type: 'markNext', count: 1, day: TODAY, slot: null });
    expect(Object.keys(next.data.read)).toEqual([chapterKey(ot.sequence[0].book, ot.sequence[0].chapter)]);
  });
});

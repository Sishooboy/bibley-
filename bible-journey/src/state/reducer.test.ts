import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppData } from '../lib/storage';
import { reducer, type State } from './reducer';

const TODAY = '2026-02-10';
const YESTERDAY = '2026-02-09';

/** Streaks are relative to "now", and every cue here depends on one. */
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-02-10T09:00:00'));
});
afterEach(() => vi.useRealTimers());

function state(over: Partial<AppData> = {}, cue: State['cue'] = null): State {
  return {
    data: {
      version: 1,
      planId: 'full_story_first',
      read: {},
      notes: [],
      startedAt: '2026-01-01',
      ...over,
    },
    previous: null,
    cue,
  };
}

/** A journal that has already been read today, so marking again is ordinary. */
const readToday = () => state({ read: { 'Genesis|1': TODAY } });

describe('the sound a change earns', () => {
  it('rings the streak on the first chapter of the day', () => {
    // Read yesterday, nothing yet today: this mark is what carries it forward.
    const next = reducer(state({ read: { 'Genesis|1': YESTERDAY } }), {
      type: 'markNext',
      count: 1,
      day: TODAY,
      slot: null,
    });
    expect(next.cue?.name).toBe('streak');
  });

  it('only ticks for the second chapter of the same day', () => {
    const next = reducer(readToday(), { type: 'markNext', count: 1, day: TODAY, slot: null });
    expect(next.cue?.name).toBe('chapter');
  });

  it('is one sound for five chapters, not five', () => {
    const next = reducer(readToday(), { type: 'markNext', count: 5, day: TODAY, slot: null });
    expect(next.cue).toEqual({ id: 1, name: 'chapter' });
  });

  it('rings the bell for a finished book', () => {
    const next = reducer(readToday(), {
      type: 'markChapters',
      book: 'Jude',
      chapters: [1],
      day: TODAY,
      slot: null,
    });
    expect(next.cue?.name).toBe('book');
  });

  /*
   * A square is the other way to finish a book. Tapping the last chapter of Jude
   * and getting the tick any other chapter gets would be the worse of the two.
   */
  it('rings the bell when the last square of a book is tapped', () => {
    const next = reducer(readToday(), {
      type: 'toggleChapter',
      book: 'Jude',
      chapter: 1,
      day: TODAY,
      slot: null,
    });
    expect(next.cue?.name).toBe('book');
  });

  it('says nothing at all when asked to mark no chapters', () => {
    const before = state({ read: { 'Genesis|1': TODAY } }, { id: 4, name: 'chapter' });
    const next = reducer(before, { type: 'markNext', count: 0, day: TODAY, slot: null });
    expect(next).toBe(before);
  });
});

describe('taking something back', () => {
  it('ticks down when a square is unmarked', () => {
    const marked = reducer(readToday(), {
      type: 'toggleChapter',
      book: 'Mark',
      chapter: 1,
      day: TODAY,
      slot: null,
    });
    const cleared = reducer(marked, {
      type: 'toggleChapter',
      book: 'Mark',
      chapter: 1,
      day: TODAY,
      slot: null,
    });
    expect(cleared.cue?.name).toBe('undo');
  });

  it('ticks down when a book is cleared', () => {
    const next = reducer(state({ read: { 'Jude|1': TODAY } }), {
      type: 'clearBook',
      book: 'Jude',
      chapters: 1,
    });
    expect(next.cue?.name).toBe('undo');
  });

  it('ticks down on undo, whatever was undone', () => {
    const marked = reducer(readToday(), {
      type: 'markChapters',
      book: 'Jude',
      chapters: [1],
      day: TODAY,
      slot: null,
    });
    expect(reducer(marked, { type: 'undo' }).cue?.name).toBe('undo');
  });
});

/**
 * The rule that matters most, and the one that is invisible until it is wrong:
 * a pull from the server can finish a book and extend a streak, but it happened
 * on the other device. Ringing a bell at an empty desk for something somebody
 * already celebrated on their phone is worse than saying nothing.
 */
describe('silence', () => {
  it('says nothing when the server hands back a bigger journal', () => {
    const before = state({ read: {} }, { id: 3, name: 'chapter' });
    const pulled: AppData = {
      ...before.data,
      read: { 'Jude|1': TODAY, 'Genesis|1': YESTERDAY },
    };

    const next = reducer(before, { type: 'mergeRemote', data: pulled });

    expect(next.data.read).toEqual(pulled.read);
    // The same cue object, so the effect watching it never fires again.
    expect(next.cue).toBe(before.cue);
  });

  it('says nothing when a journal is restored from a file', () => {
    const before = state({}, { id: 3, name: 'chapter' });
    const next = reducer(before, {
      type: 'importData',
      data: { ...before.data, read: { 'Jude|1': TODAY } },
    });
    expect(next.cue).toBe(before.cue);
  });

  it('says nothing for a note or a plan switch', () => {
    const before = state({}, { id: 3, name: 'chapter' });
    const quiet = [
      reducer(before, { type: 'saveNote', book: 'John', chapter: 3, text: 'the hinge' }),
      reducer(before, { type: 'choosePlan', id: 'nt_story_first' }),
    ];
    for (const next of quiet) expect(next.cue).toBe(before.cue);
  });
});

/**
 * Marking two chapters in a row is the same cue twice. An effect watching only
 * the name would fire once and the second chapter would land in silence, which
 * reads as a tap that did not register.
 */
describe('repeats', () => {
  it('stamps a new id every time, so an identical cue is heard again', () => {
    const first = reducer(readToday(), { type: 'markNext', count: 1, day: TODAY, slot: null });
    const second = reducer(first, { type: 'markNext', count: 1, day: TODAY, slot: null });

    expect(first.cue?.name).toBe('chapter');
    expect(second.cue?.name).toBe('chapter');
    expect(second.cue?.id).toBeGreaterThan(first.cue?.id ?? 0);
  });
});

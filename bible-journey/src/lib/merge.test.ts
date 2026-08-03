import { describe, expect, it } from 'vitest';
import { mergeJournals, sameJournal } from './merge';
import type { AppData, Note } from './storage';

function journal(over: Partial<AppData> = {}): AppData {
  return {
    version: 1,
    planId: 'both',
    read: {},
    notes: [],
    startedAt: '2026-01-01',
    ...over,
  };
}

function note(over: Partial<Note> = {}): Note {
  return {
    id: 'n1',
    book: 'John',
    chapter: 1,
    text: 'first',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

/**
 * Every case below is a bug that actually shipped, or the rule that fixed it.
 * Merging is the one place in this app where being wrong loses a reader's work,
 * and both real bugs were found by hand rather than by anything automatic.
 */
describe('mergeJournals', () => {
  it('unions chapters from two devices', () => {
    const phone = journal({ read: { 'John|1': '2026-02-01' } });
    const laptop = journal({ read: { 'John|2': '2026-02-02' } });

    expect(mergeJournals(phone, laptop).read).toEqual({
      'John|1': '2026-02-01',
      'John|2': '2026-02-02',
    });
  });

  it('keeps the earlier day when both marked the same chapter', () => {
    const a = journal({ read: { 'John|1': '2026-02-05' } });
    const b = journal({ read: { 'John|1': '2026-02-01' } });

    expect(mergeJournals(a, b).read['John|1']).toBe('2026-02-01');
    // Order must not change the answer.
    expect(mergeJournals(b, a).read['John|1']).toBe('2026-02-01');
  });

  it('lets null outrank a date, since it means read before the journal began', () => {
    const imported = journal({ read: { 'John|1': null } });
    const local = journal({ read: { 'John|1': '2026-02-01' } });

    expect(mergeJournals(imported, local).read['John|1']).toBeNull();
    expect(mergeJournals(local, imported).read['John|1']).toBeNull();
  });

  // The first real bug: clearing a chapter, then syncing, brought it back.
  it('honours a tombstone the other side has not seen', () => {
    const cleared = journal({
      read: {},
      removed: { 'John|1': '2026-02-02T10:00:00.000Z' },
    });
    const stale = journal({ read: { 'John|1': '2026-02-01' } });

    expect(mergeJournals(cleared, stale).read).not.toHaveProperty('John|1');
    expect(mergeJournals(stale, cleared).read).not.toHaveProperty('John|1');
  });

  // The second real bug, caused by fixing the first: re-marking a chapter on the
  // same day it was cleared tied on the day, and the tombstone won forever.
  it('lets a re-mark on the same day beat its own tombstone', () => {
    const remarked = journal({
      read: { 'John|1': '2026-02-02' },
      removed: { 'John|1': '2026-02-02T10:00:00.000Z' },
      markedAt: { 'John|1': '2026-02-02T10:05:00.000Z' },
    });
    const other = journal();

    const merged = mergeJournals(remarked, other);
    expect(merged.read['John|1']).toBe('2026-02-02');
    // The tombstone is retired, so the pair cannot re-fight on the next sync.
    expect(merged.removed ?? {}).not.toHaveProperty('John|1');
  });

  it('still clears when the tombstone is the later action', () => {
    const cleared = journal({
      read: {},
      removed: { 'John|1': '2026-02-02T11:00:00.000Z' },
      markedAt: { 'John|1': '2026-02-02T10:00:00.000Z' },
    });

    expect(mergeJournals(cleared, journal()).read).not.toHaveProperty('John|1');
  });

  it('falls back to comparing days for journals written before markedAt existed', () => {
    const legacy = journal({
      read: { 'John|1': '2026-02-03' },
      removed: { 'John|1': '2026-02-02T10:00:00.000Z' },
    });

    // Read on the 3rd, cleared on the 2nd: the read is newer, so it survives.
    expect(mergeJournals(legacy, journal()).read['John|1']).toBe('2026-02-03');
  });

  it('never tombstones a chapter marked as read before the journal began', () => {
    const odd = journal({
      read: { 'John|1': null },
      removed: { 'John|1': '2026-02-02T10:00:00.000Z' },
    });

    expect(mergeJournals(odd, journal()).read['John|1']).toBeNull();
  });

  it('keeps the newer note per chapter', () => {
    const older = journal({ notes: [note({ text: 'older' })] });
    const newer = journal({
      notes: [note({ id: 'n2', text: 'newer', updatedAt: '2026-03-01T00:00:00.000Z' })],
    });

    const merged = mergeJournals(older, newer);
    expect(merged.notes).toHaveLength(1);
    expect(merged.notes[0].text).toBe('newer');
  });

  it('keeps notes on different chapters of the same book', () => {
    const a = journal({ notes: [note({ chapter: 1 })] });
    const b = journal({ notes: [note({ id: 'n2', chapter: 2 })] });

    expect(mergeJournals(a, b).notes).toHaveLength(2);
  });

  it('takes the earlier start date and the later prefs', () => {
    const a = journal({
      startedAt: '2026-02-01',
      prefs: { remindersEnabled: false, reminderTime: '20:00', updatedAt: '2026-02-01T00:00:00Z' },
    });
    const b = journal({
      startedAt: '2026-01-01',
      prefs: { remindersEnabled: true, reminderTime: '07:30', updatedAt: '2026-03-01T00:00:00Z' },
    });

    const merged = mergeJournals(a, b);
    expect(merged.startedAt).toBe('2026-01-01');
    expect(merged.prefs?.reminderTime).toBe('07:30');
  });

  it('unions time of day tags from two devices', () => {
    const a = journal({ read: { 'John|1': '2026-02-01' }, slots: { 'John|1': 'morning' } });
    const b = journal({ read: { 'John|2': '2026-02-01' }, slots: { 'John|2': 'night' } });

    expect(mergeJournals(a, b).slots).toEqual({ 'John|1': 'morning', 'John|2': 'night' });
  });

  it('lets the later mark describe when it was read', () => {
    const early = journal({
      read: { 'John|1': '2026-02-01' },
      slots: { 'John|1': 'morning' },
      markedAt: { 'John|1': '2026-02-01T08:00:00.000Z' },
    });
    const late = journal({
      read: { 'John|1': '2026-02-01' },
      slots: { 'John|1': 'night' },
      markedAt: { 'John|1': '2026-02-01T22:00:00.000Z' },
    });

    expect(mergeJournals(early, late).slots?.['John|1']).toBe('night');
    expect(mergeJournals(late, early).slots?.['John|1']).toBe('night');
  });

  it('drops a tag whose chapter was cleared', () => {
    // Litter otherwise, and it would reattach to a different reading later.
    const cleared = journal({
      read: {},
      removed: { 'John|1': '2026-02-02T10:00:00.000Z' },
      slots: { 'John|1': 'morning' },
    });
    const stale = journal({ read: { 'John|1': '2026-02-01' }, slots: { 'John|1': 'morning' } });

    const merged = mergeJournals(cleared, stale);
    expect(merged.read).not.toHaveProperty('John|1');
    expect(merged.slots ?? {}).not.toHaveProperty('John|1');
  });

  it('leaves untagged chapters untagged rather than inventing a default', () => {
    const a = journal({ read: { 'John|1': '2026-02-01' } });
    const b = journal({ read: { 'John|2': '2026-02-01' } });

    expect(mergeJournals(a, b).slots).toBeUndefined();
  });

  it('is stable when merged with itself', () => {
    const one = journal({
      read: { 'John|1': '2026-02-01', 'Mark|3': '2026-02-04' },
      removed: { 'John|2': '2026-02-03T10:00:00.000Z' },
      markedAt: { 'John|1': '2026-02-01T09:00:00.000Z' },
      notes: [note()],
    });

    expect(sameJournal(mergeJournals(one, one), one)).toBe(true);
  });
});

describe('sameJournal', () => {
  it('spots a changed reading day, not just a changed key set', () => {
    const a = journal({ read: { 'John|1': '2026-02-01' } });
    const b = journal({ read: { 'John|1': '2026-02-02' } });

    expect(sameJournal(a, b)).toBe(false);
  });

  it('spots an edited note with the same id', () => {
    const a = journal({ notes: [note({ text: 'before' })] });
    const b = journal({
      notes: [note({ text: 'after', updatedAt: '2026-03-01T00:00:00.000Z' })],
    });

    expect(sameJournal(a, b)).toBe(false);
  });

  it('spots a difference in tombstones alone', () => {
    const a = journal({ removed: { 'John|1': '2026-02-02T10:00:00.000Z' } });

    expect(sameJournal(a, journal())).toBe(false);
  });
});

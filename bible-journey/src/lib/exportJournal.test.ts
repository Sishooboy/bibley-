import { describe, expect, it } from 'vitest';
import { buildExport, countJournal, exportFilename } from './exportJournal';
import { normalize, type AppData } from './storage';

function journal(over: Partial<AppData> = {}): AppData {
  return {
    version: 1,
    planId: 'both',
    read: { 'Genesis|1': '2026-02-01', '1 Samuel|3': '2026-02-02' },
    markedAt: { 'Genesis|1': '2026-02-01T09:00:00.000Z' },
    removed: { 'Mark|1': '2026-02-03T09:00:00.000Z' },
    removedHighlights: { h9: '2026-02-03T09:00:00.000Z' },
    removedNotes: { 'John|3': '2026-02-03T09:00:00.000Z' },
    slots: { 'Genesis|1': 'morning' },
    notes: [
      {
        id: 'n1',
        book: 'John',
        chapter: null,
        text: 'good book',
        createdAt: '2026-02-01T09:00:00.000Z',
        updatedAt: '2026-02-01T09:00:00.000Z',
      },
    ],
    highlights: [
      {
        id: 'h1',
        book: 'John',
        chapter: 3,
        from: { verse: 16, offset: 0 },
        to: { verse: 16, offset: 9 },
        text: 'For God so',
        note: 'private thought',
        createdAt: '2026-02-01T09:00:00.000Z',
        updatedAt: '2026-02-01T09:00:00.000Z',
      },
    ],
    startedAt: '2026-01-01',
    ownerId: 'user-1',
    ...over,
  };
}

describe('buildExport', () => {
  /*
   * The reason this file is a bare journal and not an envelope: normalize()
   * needs a top-level `read` map and drops what it does not recognise, so the
   * export is directly readable by code that knows nothing about exports.
   */
  it('produces a file that normalize() reads straight back', () => {
    const original = journal();
    const restored = normalize(buildExport(original));

    expect(restored).not.toBeNull();
    expect(restored!.read).toEqual(original.read);
    expect(restored!.notes).toEqual(original.notes);
    expect(restored!.highlights).toEqual(original.highlights);
  });

  /*
   * A backup that drops the fields settling a merge is a backup that changes the
   * journal when it comes back: a tombstone lost here is a cleared chapter that
   * resurrects on the next sync.
   */
  it('keeps every field a merge depends on', () => {
    const out = buildExport(journal());
    for (const field of [
      'read',
      'markedAt',
      'removed',
      'removedHighlights',
      'removedNotes',
      'slots',
      'notes',
      'highlights',
      'startedAt',
      'planId',
      'ownerId',
    ] as const) {
      expect(out[field], `missing ${field}`).toBeDefined();
    }
  });

  it('says when it was taken, without disturbing the journal', () => {
    const at = new Date('2026-09-02T10:30:00.000Z');
    const out = buildExport(journal(), at);

    expect(out.exportedAt).toBe('2026-09-02T10:30:00.000Z');
    expect(out.app).toBe('Bibley');
    // The two extra keys are the only difference.
    const { exportedAt: _a, app: _b, ...rest } = out;
    expect(rest).toEqual(journal());
  });

  it('copies rather than references, so a later edit cannot reach the file', () => {
    const data = journal();
    const out = buildExport(data);
    data.read['Genesis|2'] = '2026-02-05';

    expect(out.read['Genesis|2']).toBeUndefined();
  });
});

describe('countJournal', () => {
  it('counts what is in the file', () => {
    expect(countJournal(journal())).toEqual({
      chapters: 2,
      books: 2,
      notes: 1,
      highlights: 1,
    });
  });

  it('splits a numbered book on the right separator', () => {
    // "1 Samuel|3" is one book called 1 Samuel, not a book called "1".
    const counts = countJournal(journal({ read: { '1 Samuel|3': null, '1 Samuel|4': null } }));
    expect(counts).toMatchObject({ chapters: 2, books: 1 });
  });

  it('reports an empty journal as empty rather than throwing', () => {
    const empty = journal({ read: {}, notes: [], highlights: undefined });
    expect(countJournal(empty)).toEqual({ chapters: 0, books: 0, notes: 0, highlights: 0 });
  });
});

describe('exportFilename', () => {
  it('matches the pattern the repo already gitignores', () => {
    expect(exportFilename('2026-09-02')).toBe('bibley-backup-2026-09-02.json');
  });
});

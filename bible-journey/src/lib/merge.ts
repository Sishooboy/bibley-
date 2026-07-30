import type { AppData, Note, ReadMap } from './storage';

/**
 * Union merge, deliberately.
 *
 * Two devices editing the same journal can only disagree in ways this data shape
 * resolves without asking: a chapter is read or it isn't, and the earlier date is
 * the true one. Notes are per book and chapter, so the later edit wins.
 *
 * The tradeoff is that unmarking does not travel. Clear a chapter on your phone
 * while your laptop still has it, and the next merge brings it back. That is the
 * failure mode worth having: progress is never lost, only occasionally resurrected.
 */
export function mergeJournals(a: AppData, b: AppData): AppData {
  return {
    version: 1,
    read: mergeRead(a.read, b.read),
    notes: mergeNotes(a.notes, b.notes),
    startedAt: a.startedAt < b.startedAt ? a.startedAt : b.startedAt,
    backedUpAt: a.backedUpAt,
  };
}

function mergeRead(a: ReadMap, b: ReadMap): ReadMap {
  const out: ReadMap = { ...a };
  for (const [key, value] of Object.entries(b)) {
    if (!(key in out)) {
      out[key] = value;
      continue;
    }
    const existing = out[key];
    // null means "read before the journal started", which outranks any date.
    if (existing === null || value === null) {
      out[key] = null;
    } else {
      out[key] = existing < value ? existing : value;
    }
  }
  return out;
}

function noteKey(note: Note): string {
  return `${note.book}|${note.chapter ?? 'book'}`;
}

function mergeNotes(a: Note[], b: Note[]): Note[] {
  const byTarget = new Map<string, Note>();
  for (const note of [...a, ...b]) {
    const key = noteKey(note);
    const existing = byTarget.get(key);
    if (!existing || note.updatedAt > existing.updatedAt) byTarget.set(key, note);
  }
  return [...byTarget.values()].sort((x, y) => x.createdAt.localeCompare(y.createdAt));
}

/** Cheap structural comparison, used to skip pointless writes. */
export function sameJournal(a: AppData, b: AppData): boolean {
  if (a.notes.length !== b.notes.length) return false;
  const aRead = Object.keys(a.read);
  if (aRead.length !== Object.keys(b.read).length) return false;
  for (const key of aRead) {
    if (!(key in b.read) || a.read[key] !== b.read[key]) return false;
  }
  for (const note of a.notes) {
    const match = b.notes.find((n) => n.id === note.id);
    if (!match || match.text !== note.text || match.updatedAt !== note.updatedAt) return false;
  }
  return true;
}

import type { AppData, Note, ReadMap } from './storage';

/**
 * Adds win by union, deletions are explicit.
 *
 * A chapter is read or it isn't, so unioning the read maps and keeping the
 * earlier date resolves two devices without asking anyone anything. Unmarking is
 * the case a union gets wrong, since an absent key is indistinguishable from one
 * the other device hasn't seen yet. So unmarking writes a tombstone, and a
 * tombstone removes the chapter unless it was read again afterwards.
 */
export function mergeJournals(a: AppData, b: AppData): AppData {
  const markedAt = mergeStamps(a.markedAt, b.markedAt);
  const removed = mergeStamps(a.removed, b.removed);
  // A mark that came after its tombstone retires it, so the pair can't keep
  // re-fighting on every sync.
  for (const [key, at] of Object.entries(removed)) {
    if (markedAt[key] && markedAt[key] > at) delete removed[key];
  }

  const read = applyRemovals(mergeRead(a.read, b.read), removed, markedAt);

  return {
    version: 1,
    planId: a.planId ?? b.planId,
    read,
    removed: Object.keys(removed).length > 0 ? removed : undefined,
    markedAt: Object.keys(markedAt).length > 0 ? markedAt : undefined,
    notes: mergeNotes(a.notes, b.notes),
    startedAt: a.startedAt < b.startedAt ? a.startedAt : b.startedAt,
    backedUpAt: a.backedUpAt,
    ownerId: a.ownerId ?? b.ownerId,
    prefs: newerPrefs(a.prefs, b.prefs),
  };
}

/** Settings are a single small object, so the later edit simply wins. */
function newerPrefs(a: AppData['prefs'], b: AppData['prefs']): AppData['prefs'] {
  if (!a) return b;
  if (!b) return a;
  return (b.updatedAt ?? '') > (a.updatedAt ?? '') ? b : a;
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
    if (existing === null || value === null) out[key] = null;
    else out[key] = existing < value ? existing : value;
  }
  return out;
}

/** Latest timestamp per key wins. Used for both marks and tombstones. */
function mergeStamps(
  a: Record<string, string> = {},
  b: Record<string, string> = {},
): Record<string, string> {
  const out = { ...a };
  for (const [key, at] of Object.entries(b)) {
    if (!out[key] || at > out[key]) out[key] = at;
  }
  return out;
}

/**
 * A tombstone removes a chapter unless it was marked again afterwards. Journals
 * written before marks were timestamped fall back to comparing days, which is
 * the best that data supports.
 */
function applyRemovals(
  read: ReadMap,
  removed: Record<string, string>,
  markedAt: Record<string, string>,
): ReadMap {
  const out = { ...read };
  for (const [key, at] of Object.entries(removed)) {
    if (!(key in out)) continue;
    const value = out[key];
    // null is the "read before this journal existed" marker: never tombstoned.
    if (value === null) continue;
    const marked = markedAt[key];
    if (marked) {
      if (marked > at) continue;
    } else if (value > at.slice(0, 10)) {
      continue;
    }
    delete out[key];
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
  const aRemoved = Object.keys(a.removed ?? {});
  if (aRemoved.length !== Object.keys(b.removed ?? {}).length) return false;
  for (const key of aRemoved) {
    if (a.removed?.[key] !== b.removed?.[key]) return false;
  }
  for (const note of a.notes) {
    const match = b.notes.find((n) => n.id === note.id);
    if (!match || match.text !== note.text || match.updatedAt !== note.updatedAt) return false;
  }
  return true;
}

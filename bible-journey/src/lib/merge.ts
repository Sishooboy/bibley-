import type { AppData, Highlight, Note, ReadMap, Slot } from './storage';

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

  const read = applyRemovals(mergeRead(a, b), removed, markedAt);
  const slots = mergeSlots(a, b, read);

  return {
    version: 1,
    planId: a.planId ?? b.planId,
    read,
    removed: Object.keys(removed).length > 0 ? removed : undefined,
    markedAt: Object.keys(markedAt).length > 0 ? markedAt : undefined,
    slots: Object.keys(slots).length > 0 ? slots : undefined,
    ...mergeHighlights(a, b),
    ...mergeNotes(a, b),
    startedAt: a.startedAt < b.startedAt ? a.startedAt : b.startedAt,
    backedUpAt: a.backedUpAt,
    ownerId: a.ownerId ?? b.ownerId,
    prefs: newerPrefs(a.prefs, b.prefs),
  };
}

/**
 * Time of day is a tag on a mark, so it follows the mark: the device that
 * marked later describes it, and a tag whose chapter is gone goes with it. A
 * disagreement here costs a label, never a chapter, so it stays this simple.
 */
function mergeSlots(a: AppData, b: AppData, read: ReadMap): Record<string, Slot> {
  const out: Record<string, Slot> = { ...(a.slots ?? {}) };
  for (const [key, slot] of Object.entries(b.slots ?? {})) {
    const mine = out[key];
    if (!mine) {
      out[key] = slot;
      continue;
    }
    if (mine === slot) continue;
    // Both sides tagged it differently. The later mark is the later opinion.
    const aStamp = a.markedAt?.[key] ?? '';
    const bStamp = b.markedAt?.[key] ?? '';
    if (bStamp > aStamp) out[key] = slot;
  }

  // A tag on a chapter that is no longer read is litter, and it would come back
  // to life attached to the wrong reading if the chapter were ever marked again.
  for (const key of Object.keys(out)) {
    if (!(key in read)) delete out[key];
  }
  return out;
}

/** Settings are a single small object, so the later edit simply wins. */
function newerPrefs(a: AppData['prefs'], b: AppData['prefs']): AppData['prefs'] {
  if (!a) return b;
  if (!b) return a;
  return (b.updatedAt ?? '') > (a.updatedAt ?? '') ? b : a;
}

/**
 * One chapter, one reading day, and the last thing you said about it wins.
 *
 * This used to keep whichever day was earlier, which quietly threw away
 * corrections: re-date a chapter to a later day and the next sync would put the
 * old day back, so it looked as though the change had never registered. A
 * correction is by definition the more recent statement, and `markedAt` records
 * exactly that, so the side that marked it last supplies the day.
 *
 * Journals written before marks were timestamped have nothing to compare, and
 * fall back to the old earliest-wins rule, which is the best that data supports.
 */
function mergeRead(a: AppData, b: AppData): ReadMap {
  const out: ReadMap = { ...a.read };
  for (const [key, value] of Object.entries(b.read)) {
    if (!(key in out)) {
      out[key] = value;
      continue;
    }
    const existing = out[key];
    // null means "read before the journal started", which outranks any date.
    if (existing === null || value === null) {
      out[key] = null;
      continue;
    }
    if (existing === value) continue;

    const aAt = a.markedAt?.[key];
    const bAt = b.markedAt?.[key];
    if (aAt && bAt) out[key] = bAt > aAt ? value : existing;
    else if (bAt) out[key] = value;
    else if (aAt) out[key] = existing;
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

/**
 * Highlights follow the chapter rules rather than the note rules: they are
 * identified by id, they union, and deleting one needs a tombstone, because an
 * absent highlight is indistinguishable from one the other device has not seen.
 * The same reasoning, and the same bug, as unmarking a chapter.
 */
function mergeHighlights(
  a: AppData,
  b: AppData,
): Pick<AppData, 'highlights' | 'removedHighlights'> {
  const removed = mergeStamps(a.removedHighlights, b.removedHighlights);

  const byId = new Map<string, Highlight>();
  for (const highlight of [...(a.highlights ?? []), ...(b.highlights ?? [])]) {
    const existing = byId.get(highlight.id);
    if (!existing || highlight.updatedAt > existing.updatedAt) byId.set(highlight.id, highlight);
  }

  // Editing a highlight after deleting it elsewhere retires the tombstone, the
  // way re-marking a chapter retires its own.
  for (const [id, at] of Object.entries(removed)) {
    const live = byId.get(id);
    if (live && live.updatedAt > at) delete removed[id];
    else byId.delete(id);
  }

  const highlights = [...byId.values()].sort((x, y) => x.createdAt.localeCompare(y.createdAt));
  return {
    highlights: highlights.length > 0 ? highlights : undefined,
    removedHighlights: Object.keys(removed).length > 0 ? removed : undefined,
  };
}

/**
 * A note is identified by what it is about, not by its id. Two devices can each
 * write the first note on John, and there is only one note on John.
 */
export function noteKey(note: Pick<Note, 'book' | 'chapter'>): string {
  return `${note.book}|${note.chapter ?? 'book'}`;
}

/**
 * Notes needed tombstones too, and had none. Deleting one only removed it from
 * the local array, so the next sync unioned it straight back off the server and
 * it reappeared, for ever. The same bug as unmarking a chapter, and as deleting
 * a highlight, in the one place it had not been fixed.
 *
 * The tombstone is keyed by target rather than by id, because that is what the
 * merge dedupes on: an id-keyed tombstone would miss the surviving note whenever
 * two devices had each written their own note on the same chapter.
 */
function mergeNotes(a: AppData, b: AppData): Pick<AppData, 'notes' | 'removedNotes'> {
  const removed = mergeStamps(a.removedNotes, b.removedNotes);

  const byTarget = new Map<string, Note>();
  for (const note of [...a.notes, ...b.notes]) {
    const key = noteKey(note);
    const existing = byTarget.get(key);
    if (!existing || note.updatedAt > existing.updatedAt) byTarget.set(key, note);
  }

  // Writing on that chapter again after deleting it elsewhere retires the
  // tombstone, the way a re-marked chapter retires its own.
  for (const [key, at] of Object.entries(removed)) {
    const live = byTarget.get(key);
    if (live && live.updatedAt > at) delete removed[key];
    else byTarget.delete(key);
  }

  return {
    notes: [...byTarget.values()].sort((x, y) => x.createdAt.localeCompare(y.createdAt)),
    removedNotes: Object.keys(removed).length > 0 ? removed : undefined,
  };
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

  // This decides whether a change is worth writing to the server, so anything
  // missing from it is a change that silently never syncs.
  const aHighlights = a.highlights ?? [];
  const bHighlights = b.highlights ?? [];
  if (aHighlights.length !== bHighlights.length) return false;
  for (const highlight of aHighlights) {
    const match = bHighlights.find((h) => h.id === highlight.id);
    if (!match || match.updatedAt !== highlight.updatedAt || match.note !== highlight.note) {
      return false;
    }
  }
  const aRemovedHl = Object.keys(a.removedHighlights ?? {});
  if (aRemovedHl.length !== Object.keys(b.removedHighlights ?? {}).length) return false;
  for (const id of aRemovedHl) {
    if (a.removedHighlights?.[id] !== b.removedHighlights?.[id]) return false;
  }

  const aRemovedNotes = Object.keys(a.removedNotes ?? {});
  if (aRemovedNotes.length !== Object.keys(b.removedNotes ?? {}).length) return false;
  for (const key of aRemovedNotes) {
    if (a.removedNotes?.[key] !== b.removedNotes?.[key]) return false;
  }

  return true;
}

/**
 * Every rule about how the journal changes, and the sound each change earns.
 *
 * Split out of `store.tsx` so the provider stays a component file: exporting a
 * plain function beside a component is what stops Vite's fast refresh from
 * preserving state on a save, and the reducer has to be exported because the
 * wiring from an action to a cue is worth pinning in tests.
 */
import { BOOK_BY_NAME } from '../data/plan';
import { getTrack, type PhasedTrack } from '../data/tracks';
import { relativeDay, today, type DayKey } from '../lib/dates';
import { plural } from '../lib/format';
import { noteKey } from '../lib/merge';
import type { Prefs } from '../lib/prefs';
import { nextUnread, streak } from '../lib/progress';
import { chooseCue, type Cue } from '../lib/sound';
import {
  chapterKey,
  newId,
  type AppData,
  type Highlight,
  type Note,
  type ReadMap,
  type Slot,
} from '../lib/storage';

export type Action =
  | { type: 'toggleChapter'; book: string; chapter: number; day: DayKey; slot: Slot | null }
  | { type: 'markNext'; count: number; day: DayKey; slot: Slot | null }
  | { type: 'markChapters'; book: string; chapters: number[]; day: DayKey; slot: Slot | null }
  | { type: 'clearChapters'; book: string; chapters: number[] }
  | { type: 'clearBook'; book: string; chapters: number }
  | { type: 'addHighlight'; highlight: Highlight }
  | { type: 'noteHighlight'; id: string; note: string }
  | { type: 'removeHighlight'; id: string }
  | { type: 'saveNote'; book: string; chapter: number | null; text: string }
  | { type: 'deleteNote'; id: string }
  | { type: 'importData'; data: AppData }
  | { type: 'mergeRemote'; data: AppData }
  | { type: 'choosePlan'; id: string }
  | { type: 'setPrefs'; prefs: Prefs }
  | { type: 'undo' };

export type State = {
  data: AppData;
  /** Snapshot taken before the last bulk change, for one level of undo. */
  previous: { data: AppData; label: string; tone?: 'done' } | null;
  /**
   * The sound the last change earned, if any.
   *
   * **Never part of `AppData`, and it must stay that way.** `normalize()` is a
   * whitelist and `cloud.tsx` upserts the whole row, so a cue that found its way
   * into the journal would sync, and the other device would ring a bell for
   * something nobody there had done.
   *
   * `id` counts up because the name alone is not enough to notice a repeat:
   * marking two chapters in a row is the same cue twice, and an effect watching
   * a string would only fire once. An action that earns no sound leaves the last
   * cue in place, which is inert, since the effect turns on the id changing.
   */
  cue: { id: number; name: Cue; books?: string[] } | null;
};

function withUndo(state: State, data: AppData, label: string, tone?: 'done'): State {
  return { data, previous: { data: state.data, label, tone }, cue: state.cue };
}

/**
 * Stamps a cue so an unchanged repeat still reads as a new one. A book cue
 * carries the names, because "a book finished" is not enough for a celebration
 * that wants to say which. Only set when there is something to say, so the
 * other cues stay two fields.
 */
function fire(state: State, name: Cue, books?: string[]): State['cue'] {
  const id = (state.cue?.id ?? 0) + 1;
  return books && books.length > 0 ? { id, name, books } : { id, name };
}

/**
 * Books that were unfinished before this change and are finished after it.
 *
 * Finishing a book used to produce nothing at all: the same "marked 3 chapters"
 * as any other tap. It is the only milestone the plan has between one chapter
 * and the whole Bible, and it deserves to be said out loud.
 */
function booksFinishedBy(before: ReadMap, after: ReadMap, books: string[]): string[] {
  const finished: string[] = [];
  for (const name of new Set(books)) {
    const total = BOOK_BY_NAME.get(name)?.chapters;
    if (!total) continue;
    let had = 0;
    let has = 0;
    for (let c = 1; c <= total; c++) {
      const key = chapterKey(name, c);
      if (key in before) had++;
      if (key in after) has++;
    }
    if (has === total && had < total) finished.push(name);
  }
  return finished;
}

/** The undo bar's line for a mark, celebrating a finished book when there is one. */
function markLabel(finished: string[], fallback: string): { label: string; tone?: 'done' } {
  if (finished.length === 0) return { label: fallback };
  // Short on purpose: the bar is a pill on a 375px screen, and the row behind
  // it is already showing 40/40. Truncating a milestone would be worse than
  // saying less.
  if (finished.length === 1) return { label: `${finished[0]} complete`, tone: 'done' };
  return { label: `${plural(finished.length, 'book')} complete`, tone: 'done' };
}

/** Every chapter the track asks for, read. */
function trackComplete(read: ReadMap, plan: PhasedTrack): boolean {
  return plan.sequence.every((ref) => chapterKey(ref.book, ref.chapter) in read);
}

/**
 * The sound a marking change earns, worked out from both sides of it.
 *
 * It belongs here rather than in a view because "the streak went up" is not a
 * fact about the new journal, it is a fact about the difference between two, and
 * the reducer is the only place holding both. A view could only ever guess.
 */
function markCue(
  before: ReadMap,
  after: ReadMap,
  finished: string[],
  plan: PhasedTrack,
  marked: number,
): Cue | null {
  return chooseCue({
    booksFinished: finished.length,
    /*
     * Completing the track necessarily completes its last book on the same
     * change, so asking only when a book finished misses nothing, and it saves
     * walking all 1,334 chapters on every ordinary tap.
     */
    planFinished: finished.length > 0 && trackComplete(after, plan),
    streakBefore: streak(before).current,
    streakAfter: streak(after).current,
    chaptersMarked: marked,
  });
}

/**
 * The track in force, guaranteed to be one with phases.
 *
 * Everything downstream of `Derived` reads `plan.phases`, and the streams track
 * has none. Until Daily Mix has its own path, resolving to it here would hand
 * every view an object missing the field it is about to read, so a streams track
 * falls back to the default. Nothing can select one yet.
 */
export function activeTrack(id: string | undefined): PhasedTrack {
  const track = getTrack(id);
  return track.kind === 'phased' ? track : (getTrack(undefined) as PhasedTrack);
}

/**
 * Deleting a note has to be recorded for the same reason unmarking a chapter
 * does. Filed under what the note was about, which is what `mergeNotes` dedupes
 * on, so it still finds the note when the other device wrote its own.
 */
function buryNote(data: AppData, note: Pick<Note, 'book' | 'chapter'>): Record<string, string> {
  return { ...(data.removedNotes ?? {}), [noteKey(note)]: new Date().toISOString() };
}

/** Writing on that chapter again is the answer to having deleted it. */
function unburyNote(
  data: AppData,
  note: Pick<Note, 'book' | 'chapter'>,
): Record<string, string> | undefined {
  if (!data.removedNotes) return undefined;
  const next = { ...data.removedNotes };
  delete next[noteKey(note)];
  return Object.keys(next).length > 0 ? next : undefined;
}

/** Unmarking has to be recorded, or the next union merge quietly restores it. */
function tombstone(data: AppData, keys: string[]): Record<string, string> {
  const at = new Date().toISOString();
  const removed = { ...(data.removed ?? {}) };
  for (const key of keys) removed[key] = at;
  return removed;
}

/** Reading it again retracts the tombstone and stamps when that happened. */
function untomb(data: AppData, keys: string[]): Record<string, string> | undefined {
  if (!data.removed) return undefined;
  const removed = { ...data.removed };
  for (const key of keys) delete removed[key];
  return Object.keys(removed).length > 0 ? removed : undefined;
}

/**
 * A mark has to out-rank a tombstone made the same day, so record the moment
 * rather than relying on the reading day alone.
 */
function stampMarks(data: AppData, keys: string[]): Record<string, string> {
  const at = new Date().toISOString();
  const markedAt = { ...(data.markedAt ?? {}) };
  for (const key of keys) markedAt[key] = at;
  return markedAt;
}

/**
 * Time of day is optional, so an unset slot clears any previous tag rather than
 * leaving a stale one behind. Re-marking a chapter without saying when means you
 * did not say when, not that last month's answer still stands.
 */
function stampSlots(
  data: AppData,
  keys: string[],
  slot: Slot | null,
): Record<string, Slot> | undefined {
  const slots = { ...(data.slots ?? {}) };
  for (const key of keys) {
    if (slot) slots[key] = slot;
    else delete slots[key];
  }
  return Object.keys(slots).length > 0 ? slots : undefined;
}

/** Removes keys from an optional stamp map, dropping the map when it empties. */
function dropKeys(
  map: Record<string, string> | undefined,
  keys: string[],
): Record<string, string> | undefined {
  if (!map) return undefined;
  const out = { ...map };
  for (const key of keys) delete out[key];
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Dropping a chapter drops its tag with it. */
function dropSlots(data: AppData, keys: string[]): Record<string, Slot> | undefined {
  if (!data.slots) return undefined;
  const slots = { ...data.slots };
  for (const key of keys) delete slots[key];
  return Object.keys(slots).length > 0 ? slots : undefined;
}

/**
 * Marking records the day you read, which is not always the day you tapped.
 * The undo label has to say so, or backdating is invisible after the fact.
 */
function whenSuffix(day: DayKey): string {
  return day === today() ? '' : `, ${relativeDay(day)}`;
}

/**
 * Exported for the tests, which is the only reason it is not private.
 *
 * Which action earns which sound is the half of this feature that `chooseCue`
 * cannot check on its own, and the two rules most worth pinning are both about
 * silence: a pull from the server rings nothing, and neither does a change that
 * marked no chapter.
 */
export function reducer(state: State, action: Action): State {
  const { data } = state;

  switch (action.type) {
    case 'toggleChapter': {
      // Self-reversing, so it deliberately doesn't consume the undo slot.
      const key = chapterKey(action.book, action.chapter);
      const read = { ...data.read };
      if (key in read) {
        delete read[key];
        return {
          ...state,
          data: {
            ...data,
            read,
            removed: tombstone(data, [key]),
            slots: dropSlots(data, [key]),
          },
          cue: fire(state, 'undo'),
        };
      }
      // The reading day comes from the action; markedAt still records the moment
      // of the tap, because that is what settles a clear against a re-mark.
      read[key] = action.day;
      /*
       * A square is the other way to finish a book, so it has to earn the same
       * bell the slider does. Tapping the last chapter of Jude and hearing the
       * tick you get for any other chapter would be the worse of the two.
       */
      const finished = booksFinishedBy(data.read, read, [action.book]);
      const cue = markCue(data.read, read, finished, activeTrack(data.planId), 1);
      return {
        ...state,
        data: {
          ...data,
          read,
          removed: untomb(data, [key]),
          markedAt: stampMarks(data, [key]),
          slots: stampSlots(data, [key], action.slot),
        },
        cue: cue ? fire(state, cue, finished) : state.cue,
      };
    }
    case 'markNext': {
      const plan = activeTrack(data.planId);
      const refs = nextUnread(data.read, action.count, plan);
      if (refs.length === 0) return state;
      const read = { ...data.read };
      const keys = refs.map((ref) => chapterKey(ref.book, ref.chapter));
      for (const key of keys) read[key] = action.day;
      const label =
        refs.length === 1
          ? `Marked ${refs[0].book} ${refs[0].chapter}`
          : `Marked ${refs.length} chapters`;
      const finished = booksFinishedBy(data.read, read, refs.map((ref) => ref.book));
      const done = markLabel(finished, label + whenSuffix(action.day));
      const next = withUndo(
        state,
        {
          ...data,
          read,
          removed: untomb(data, keys),
          markedAt: stampMarks(data, keys),
          slots: stampSlots(data, keys, action.slot),
        },
        done.label,
        done.tone,
      );
      // Five chapters at once is one sound, not five.
      const cue = markCue(data.read, read, finished, plan, keys.length);
      return cue ? { ...next, cue: fire(state, cue, finished) } : next;
    }
    /**
     * Marks an explicit set of chapters against one day. Chapters already read
     * are included rather than skipped: re-marking a selection is how a reader
     * corrects the day they read something.
     */
    case 'markChapters': {
      if (action.chapters.length === 0) return state;
      const read = { ...data.read };
      const keys = action.chapters.map((c) => chapterKey(action.book, c));
      for (const key of keys) read[key] = action.day;
      const finished = booksFinishedBy(data.read, read, [action.book]);
      const done = markLabel(
        finished,
        `Marked ${plural(keys.length, 'chapter')} in ${action.book}${whenSuffix(action.day)}`,
      );
      const next = withUndo(
        state,
        {
          ...data,
          read,
          removed: untomb(data, keys),
          markedAt: stampMarks(data, keys),
          slots: stampSlots(data, keys, action.slot),
        },
        done.label,
        done.tone,
      );
      const cue = markCue(
        data.read,
        read,
        finished,
        activeTrack(data.planId),
        keys.length,
      );
      return cue ? { ...next, cue: fire(state, cue, finished) } : next;
    }
    case 'clearChapters': {
      const read = { ...data.read };
      const cleared: string[] = [];
      for (const c of action.chapters) {
        const key = chapterKey(action.book, c);
        if (key in read) {
          delete read[key];
          cleared.push(key);
        }
      }
      if (cleared.length === 0) return state;
      return {
        ...withUndo(
          state,
          {
            ...data,
            read,
            removed: tombstone(data, cleared),
            slots: dropSlots(data, cleared),
          },
          `Cleared ${plural(cleared.length, 'chapter')} in ${action.book}`,
        ),
        cue: fire(state, 'undo'),
      };
    }
    case 'clearBook': {
      const read = { ...data.read };
      const cleared: string[] = [];
      for (let c = 1; c <= action.chapters; c++) {
        const key = chapterKey(action.book, c);
        if (key in read) {
          delete read[key];
          cleared.push(key);
        }
      }
      if (cleared.length === 0) return state;
      return {
        ...withUndo(
          state,
          { ...data, read, removed: tombstone(data, cleared), slots: dropSlots(data, cleared) },
          `Cleared ${action.book}`,
        ),
        cue: fire(state, 'undo'),
      };
    }
    case 'addHighlight':
      return {
        ...state,
        data: {
          ...data,
          highlights: [...(data.highlights ?? []), action.highlight],
          // A new highlight can reuse an id only if one was deleted and undone,
          // but clearing the tombstone costs nothing and prevents a resurrection
          // fight on the next sync.
          removedHighlights: dropKeys(data.removedHighlights, [action.highlight.id]),
        },
      };
    case 'noteHighlight': {
      const now = new Date().toISOString();
      const note = action.note.trim();
      return {
        ...state,
        data: {
          ...data,
          highlights: (data.highlights ?? []).map((h) =>
            h.id === action.id ? { ...h, note: note || undefined, updatedAt: now } : h,
          ),
        },
      };
    }
    case 'removeHighlight': {
      const highlight = (data.highlights ?? []).find((h) => h.id === action.id);
      if (!highlight) return state;
      return withUndo(
        state,
        {
          ...data,
          highlights: (data.highlights ?? []).filter((h) => h.id !== action.id),
          removedHighlights: {
            ...(data.removedHighlights ?? {}),
            [action.id]: new Date().toISOString(),
          },
        },
        'Removed highlight',
      );
    }
    case 'saveNote': {
      const now = new Date().toISOString();
      const text = action.text.trim();
      const existing = data.notes.find(
        (n) => n.book === action.book && n.chapter === action.chapter,
      );

      if (!existing) {
        if (!text) return state;
        const note: Note = {
          id: newId(),
          book: action.book,
          chapter: action.chapter,
          text,
          createdAt: now,
          updatedAt: now,
        };
        return {
          ...state,
          data: {
            ...data,
            notes: [...data.notes, note],
            removedNotes: unburyNote(data, note),
          },
        };
      }

      // Emptying the box is the other way to delete a note, and needs the same
      // tombstone the Delete button leaves.
      if (!text) {
        return {
          ...state,
          data: {
            ...data,
            notes: data.notes.filter((n) => n.id !== existing.id),
            removedNotes: buryNote(data, existing),
          },
        };
      }
      if (text === existing.text) return state;
      return {
        ...state,
        data: {
          ...data,
          notes: data.notes.map((n) => (n.id === existing.id ? { ...n, text, updatedAt: now } : n)),
          removedNotes: unburyNote(data, existing),
        },
      };
    }
    case 'deleteNote': {
      const note = data.notes.find((n) => n.id === action.id);
      if (!note) return state;
      const next = {
        ...data,
        notes: data.notes.filter((n) => n.id !== action.id),
        // Without the tombstone the next sync unions the note back off the
        // server and it reappears, exactly as unmarking a chapter used to.
        removedNotes: buryNote(data, note),
      };
      return withUndo(state, next, 'Deleted note');
    }
    case 'choosePlan':
      if (data.planId === action.id) return state;
      // Progress is keyed by book and chapter, so switching plans keeps every
      // chapter that both plans contain.
      return { ...state, data: { ...data, planId: action.id } };
    case 'setPrefs':
      return {
        ...state,
        data: { ...data, prefs: { ...action.prefs, updatedAt: new Date().toISOString() } },
      };
    case 'importData':
      return withUndo(state, action.data, 'Restored from file');
    case 'mergeRemote':
      /*
       * Already merged with local, so it only ever adds. Undo would be
       * misleading, and so would a sound: a pull can finish a book and extend a
       * streak, but that happened on the other device. Ringing a bell at an
       * empty desk for something somebody already celebrated on their phone is
       * the one way this feature could feel broken rather than absent.
       */
      return { ...state, data: action.data };
    case 'undo':
      return state.previous
        ? { data: state.previous.data, previous: null, cue: fire(state, 'undo') }
        : state;
  }
}

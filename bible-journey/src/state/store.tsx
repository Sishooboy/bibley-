import { useCallback, useEffect, useMemo, useReducer, useState, type ReactNode } from 'react';
import { getPlan, type PlanId } from '../data/plans';
import { plural } from '../lib/format';
import type { Prefs } from '../lib/prefs';
import { clampReadingDay, relativeDay, today, type DayKey } from '../lib/dates';
import {
  nextUnread,
  overallProgress,
  pace,
  phaseProgressAll,
  phaseStatuses,
  streak,
} from '../lib/progress';
import {
  chapterKey,
  loadData,
  newId,
  requestPersistence,
  saveData,
  type AppData,
  type LoadResult,
  type Highlight,
  type Note,
  type Slot,
} from '../lib/storage';
import { StoreContext, type Derived, type Store, type UndoState } from './context';

type Action =
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
  | { type: 'choosePlan'; id: PlanId }
  | { type: 'setPrefs'; prefs: Prefs }
  | { type: 'undo' };

type State = {
  data: AppData;
  /** Snapshot taken before the last bulk change, for one level of undo. */
  previous: { data: AppData; label: string } | null;
};

function withUndo(state: State, data: AppData, label: string): State {
  return { data, previous: { data: state.data, label } };
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

function reducer(state: State, action: Action): State {
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
        };
      }
      // The reading day comes from the action; markedAt still records the moment
      // of the tap, because that is what settles a clear against a re-mark.
      read[key] = action.day;
      return {
        ...state,
        data: {
          ...data,
          read,
          removed: untomb(data, [key]),
          markedAt: stampMarks(data, [key]),
          slots: stampSlots(data, [key], action.slot),
        },
      };
    }
    case 'markNext': {
      const refs = nextUnread(data.read, action.count, getPlan(data.planId));
      if (refs.length === 0) return state;
      const read = { ...data.read };
      const keys = refs.map((ref) => chapterKey(ref.book, ref.chapter));
      for (const key of keys) read[key] = action.day;
      const label =
        refs.length === 1
          ? `Marked ${refs[0].book} ${refs[0].chapter}`
          : `Marked ${refs.length} chapters`;
      return withUndo(
        state,
        {
          ...data,
          read,
          removed: untomb(data, keys),
          markedAt: stampMarks(data, keys),
          slots: stampSlots(data, keys, action.slot),
        },
        label + whenSuffix(action.day),
      );
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
      return withUndo(
        state,
        {
          ...data,
          read,
          removed: untomb(data, keys),
          markedAt: stampMarks(data, keys),
          slots: stampSlots(data, keys, action.slot),
        },
        `Marked ${plural(keys.length, 'chapter')} in ${action.book}${whenSuffix(action.day)}`,
      );
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
      return withUndo(
        state,
        {
          ...data,
          read,
          removed: tombstone(data, cleared),
          slots: dropSlots(data, cleared),
        },
        `Cleared ${plural(cleared.length, 'chapter')} in ${action.book}`,
      );
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
      return withUndo(
        state,
        { ...data, read, removed: tombstone(data, cleared), slots: dropSlots(data, cleared) },
        `Cleared ${action.book}`,
      );
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
        return { ...state, data: { ...data, notes: [...data.notes, note] } };
      }

      if (!text) {
        return {
          ...state,
          data: { ...data, notes: data.notes.filter((n) => n.id !== existing.id) },
        };
      }
      if (text === existing.text) return state;
      return {
        ...state,
        data: {
          ...data,
          notes: data.notes.map((n) => (n.id === existing.id ? { ...n, text, updatedAt: now } : n)),
        },
      };
    }
    case 'deleteNote': {
      const note = data.notes.find((n) => n.id === action.id);
      if (!note) return state;
      const next = { ...data, notes: data.notes.filter((n) => n.id !== action.id) };
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
      // Already merged with local, so it only ever adds. Undo would be misleading.
      return { ...state, data: action.data };
    case 'undo':
      return state.previous ? { data: state.previous.data, previous: null } : state;
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const load = useMemo<LoadResult>(loadData, []);
  const [state, dispatch] = useReducer(reducer, { data: load.data, previous: null });
  const { data, previous } = state;
  /**
   * The day marking is logged against, or null for today.
   *
   * Null rather than today's date on purpose: the default has to mean "whenever
   * today is", so a session left open across midnight still logs to the right
   * day. A date the reader picked out of a calendar is the opposite, an absolute
   * answer, so that one is stored as given. Never persisted either way, because
   * reading yesterday's chapters is a moment, not a setting.
   */
  const [pickedDay, setPickedDay] = useState<DayKey | null>(null);
  /** Optional, and null means the reader did not say. That is a fine answer. */
  const [logSlot, setLogSlot] = useState<Slot | null>(null);
  /** Resolved at the moment of dispatch, which is what keeps null honest. */
  const effectiveDay = useCallback(() => pickedDay ?? today(), [pickedDay]);
  const setLogDay = useCallback((day: DayKey | null) => {
    setPickedDay(day === null ? null : clampReadingDay(day));
  }, []);

  useEffect(() => {
    saveData(data);
  }, [data]);

  useEffect(() => {
    // Fire and forget: a granted request is what keeps the browser from evicting us.
    void requestPersistence();
  }, []);

  const derived = useMemo<Derived>(() => {
    const plan = getPlan(data.planId);
    const phases = phaseProgressAll(data.read, plan);
    const overall = overallProgress(phases, plan);
    return {
      plan,
      phases,
      statuses: phaseStatuses(phases),
      overall,
      streak: streak(data.read),
      pace: pace(data.read, overall.planRead, plan),
      currentPhase: phases.find((p) => !p.done)?.phase ?? plan.phases.length,
    };
  }, [data.read, data.planId]);

  const noteFor = useCallback(
    (book: string, chapter: number | null) =>
      data.notes.find((n) => n.book === book && n.chapter === chapter),
    [data.notes],
  );

  const undoable = useMemo<UndoState>(
    () => (previous ? { label: previous.label } : null),
    [previous],
  );

  const value = useMemo<Store>(
    () => ({
      data,
      derived,
      load,
      undoable,
      noteFor,
      logDay: pickedDay,
      setLogDay,
      logSlot,
      setLogSlot,
      toggleChapter: (book, chapter) => {
        dispatch({ type: 'toggleChapter', book, chapter, day: effectiveDay(), slot: logSlot });
        setPickedDay(null);
      },
      markNext: (count) => {
        dispatch({ type: 'markNext', count, day: effectiveDay(), slot: logSlot });
        setPickedDay(null);
      },
      /*
       * The chosen day lasts for one recording and then goes back to today.
       * Carrying it over was meant to help fill in a week at a time, and instead
       * quietly put later readings on a date the reader had long stopped
       * thinking about. Re-picking a day costs two taps; finding out that a
       * month of reading all landed on one day costs an evening.
       */
      markChapters: (book, chapters) => {
        dispatch({ type: 'markChapters', book, chapters, day: effectiveDay(), slot: logSlot });
        setPickedDay(null);
      },
      clearChapters: (book, chapters) => dispatch({ type: 'clearChapters', book, chapters }),
      clearBook: (book, chapters) => dispatch({ type: 'clearBook', book, chapters }),
      addHighlight: (highlight) => dispatch({ type: 'addHighlight', highlight }),
      noteHighlight: (id, note) => dispatch({ type: 'noteHighlight', id, note }),
      removeHighlight: (id) => dispatch({ type: 'removeHighlight', id }),
      saveNote: (book, chapter, text) => dispatch({ type: 'saveNote', book, chapter, text }),
      deleteNote: (id) => dispatch({ type: 'deleteNote', id }),
      importData: (imported) => dispatch({ type: 'importData', data: imported }),
      mergeRemote: (merged) => dispatch({ type: 'mergeRemote', data: merged }),
      choosePlan: (id) => dispatch({ type: 'choosePlan', id }),
      setPrefs: (prefs) => dispatch({ type: 'setPrefs', prefs }),
      undo: () => dispatch({ type: 'undo' }),
    }),
    [data, derived, load, undoable, noteFor, pickedDay, setLogDay, logSlot, effectiveDay],
  );

  return <StoreContext value={value}>{children}</StoreContext>;
}

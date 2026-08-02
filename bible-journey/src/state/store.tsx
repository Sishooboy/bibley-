import { useCallback, useEffect, useMemo, useReducer, useState, type ReactNode } from 'react';
import { getPlan, type PlanId } from '../data/plans';
import type { Prefs } from '../lib/prefs';
import { addDays, relativeDay, today, type DayKey } from '../lib/dates';
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
  type Note,
} from '../lib/storage';
import { StoreContext, type Derived, type Store, type UndoState } from './context';

type Action =
  | { type: 'toggleChapter'; book: string; chapter: number; day: DayKey }
  | { type: 'markNext'; count: number; day: DayKey }
  | { type: 'markThrough'; book: string; chapter: number; day: DayKey }
  | { type: 'clearBook'; book: string; chapters: number }
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
        return { ...state, data: { ...data, read, removed: tombstone(data, [key]) } };
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
        { ...data, read, removed: untomb(data, keys), markedAt: stampMarks(data, keys) },
        label + whenSuffix(action.day),
      );
    }
    case 'markThrough': {
      const read = { ...data.read };
      const marked: string[] = [];
      for (let c = 1; c <= action.chapter; c++) {
        const key = chapterKey(action.book, c);
        if (key in read) continue;
        read[key] = action.day;
        marked.push(key);
      }
      if (marked.length === 0) return state;
      return withUndo(
        state,
        { ...data, read, removed: untomb(data, marked), markedAt: stampMarks(data, marked) },
        `Marked ${action.book} through ${action.chapter}${whenSuffix(action.day)}`,
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
        { ...data, read, removed: tombstone(data, cleared) },
        `Cleared ${action.book}`,
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
   * How many days back marking should be logged. Held as an offset rather than a
   * date, and never persisted, so it cannot go stale over midnight or survive a
   * reload as a silently wrong setting.
   */
  const [logOffset, setLogOffset] = useState(0);
  const logDay = useCallback(() => addDays(today(), -logOffset), [logOffset]);

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
      logOffset,
      setLogOffset,
      toggleChapter: (book, chapter) =>
        dispatch({ type: 'toggleChapter', book, chapter, day: logDay() }),
      markNext: (count) => dispatch({ type: 'markNext', count, day: logDay() }),
      markThrough: (book, chapter) =>
        dispatch({ type: 'markThrough', book, chapter, day: logDay() }),
      clearBook: (book, chapters) => dispatch({ type: 'clearBook', book, chapters }),
      saveNote: (book, chapter, text) => dispatch({ type: 'saveNote', book, chapter, text }),
      deleteNote: (id) => dispatch({ type: 'deleteNote', id }),
      importData: (imported) => dispatch({ type: 'importData', data: imported }),
      mergeRemote: (merged) => dispatch({ type: 'mergeRemote', data: merged }),
      choosePlan: (id) => dispatch({ type: 'choosePlan', id }),
      setPrefs: (prefs) => dispatch({ type: 'setPrefs', prefs }),
      undo: () => dispatch({ type: 'undo' }),
    }),
    [data, derived, load, undoable, noteFor, logOffset, logDay],
  );

  return <StoreContext value={value}>{children}</StoreContext>;
}

import { useCallback, useEffect, useMemo, useReducer, type ReactNode } from 'react';
import { today } from '../lib/dates';
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
  | { type: 'toggleChapter'; book: string; chapter: number }
  | { type: 'markNext'; count: number }
  | { type: 'markThrough'; book: string; chapter: number }
  | { type: 'clearBook'; book: string; chapters: number }
  | { type: 'saveNote'; book: string; chapter: number | null; text: string }
  | { type: 'deleteNote'; id: string }
  | { type: 'importData'; data: AppData }
  | { type: 'mergeRemote'; data: AppData }
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
      read[key] = today();
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
      const refs = nextUnread(data.read, action.count);
      if (refs.length === 0) return state;
      const read = { ...data.read };
      const keys = refs.map((ref) => chapterKey(ref.book, ref.chapter));
      for (const key of keys) read[key] = today();
      const label =
        refs.length === 1
          ? `Marked ${refs[0].book} ${refs[0].chapter}`
          : `Marked ${refs.length} chapters`;
      return withUndo(
        state,
        { ...data, read, removed: untomb(data, keys), markedAt: stampMarks(data, keys) },
        label,
      );
    }
    case 'markThrough': {
      const read = { ...data.read };
      const marked: string[] = [];
      for (let c = 1; c <= action.chapter; c++) {
        const key = chapterKey(action.book, c);
        if (key in read) continue;
        read[key] = today();
        marked.push(key);
      }
      if (marked.length === 0) return state;
      return withUndo(
        state,
        { ...data, read, removed: untomb(data, marked), markedAt: stampMarks(data, marked) },
        `Marked ${action.book} through ${action.chapter}`,
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

  useEffect(() => {
    saveData(data);
  }, [data]);

  useEffect(() => {
    // Fire and forget: a granted request is what keeps the browser from evicting us.
    void requestPersistence();
  }, []);

  const derived = useMemo<Derived>(() => {
    const phases = phaseProgressAll(data.read);
    const overall = overallProgress(data.read, phases);
    return {
      phases,
      statuses: phaseStatuses(phases),
      overall,
      streak: streak(data.read),
      pace: pace(data.read, overall.planRead),
      currentPhase: phases.find((p) => !p.done)?.phase ?? 12,
    };
  }, [data.read]);

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
      toggleChapter: (book, chapter) => dispatch({ type: 'toggleChapter', book, chapter }),
      markNext: (count) => dispatch({ type: 'markNext', count }),
      markThrough: (book, chapter) => dispatch({ type: 'markThrough', book, chapter }),
      clearBook: (book, chapters) => dispatch({ type: 'clearBook', book, chapters }),
      saveNote: (book, chapter, text) => dispatch({ type: 'saveNote', book, chapter, text }),
      deleteNote: (id) => dispatch({ type: 'deleteNote', id }),
      importData: (imported) => dispatch({ type: 'importData', data: imported }),
      mergeRemote: (merged) => dispatch({ type: 'mergeRemote', data: merged }),
      undo: () => dispatch({ type: 'undo' }),
    }),
    [data, derived, load, undoable, noteFor],
  );

  return <StoreContext value={value}>{children}</StoreContext>;
}

import { createContext } from 'react';
import type {
  OverallProgress,
  Pace,
  PhaseProgress,
  PhaseStatus,
  Streak,
} from '../lib/progress';
import type { AppData, LoadResult, Note } from '../lib/storage';

export type Derived = {
  phases: PhaseProgress[];
  statuses: Map<number, PhaseStatus>;
  overall: OverallProgress;
  streak: Streak;
  pace: Pace;
  currentPhase: number;
};

export type UndoState = { label: string } | null;

export type Store = {
  data: AppData;
  derived: Derived;
  /** How this session's data was loaded, surfaced in the backup panel. */
  load: LoadResult;
  undoable: UndoState;
  toggleChapter: (book: string, chapter: number) => void;
  /** Marks the next `count` unread chapters in plan order. */
  markNext: (count: number) => void;
  /** Marks chapters 1 through `chapter` of a book as read. */
  markThrough: (book: string, chapter: number) => void;
  clearBook: (book: string, chapters: number) => void;
  saveNote: (book: string, chapter: number | null, text: string) => void;
  deleteNote: (id: string) => void;
  noteFor: (book: string, chapter: number | null) => Note | undefined;
  importData: (data: AppData) => void;
  /** Applies an already-merged journal pulled from the cloud. Not undoable. */
  mergeRemote: (data: AppData) => void;
  undo: () => void;
};

export const StoreContext = createContext<Store | null>(null);

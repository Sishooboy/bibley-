import { createContext } from 'react';
import type {
  OverallProgress,
  Pace,
  PhaseProgress,
  PhaseStatus,
  Streak,
} from '../lib/progress';
import type { Plan, PlanId } from '../data/plans';
import type { Prefs } from '../lib/prefs';
import type { AppData, LoadResult, Note, Slot } from '../lib/storage';

export type Derived = {
  /** The reading plan in force, resolved from the stored choice. */
  plan: Plan;
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
  /**
   * Days back that marking is logged against. 0 is today. Session only: reading
   * yesterday's chapters is a moment, not a setting.
   */
  logOffset: number;
  setLogOffset: (days: number) => void;
  /** Optional time of day for the next mark. Null means the reader did not say. */
  logSlot: Slot | null;
  setLogSlot: (slot: Slot | null) => void;
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
  choosePlan: (id: PlanId) => void;
  setPrefs: (prefs: Prefs) => void;
  undo: () => void;
};

export const StoreContext = createContext<Store | null>(null);

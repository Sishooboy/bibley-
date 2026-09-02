import { createContext } from 'react';
import type {
  OverallProgress,
  Pace,
  PhaseProgress,
  PhaseStatus,
  Streak,
} from '../lib/progress';
import type { PhasedTrack } from '../data/tracks';
import type { Prefs } from '../lib/prefs';
import type { DayKey } from '../lib/dates';
import type { AppData, Highlight, LoadResult, Note, Slot } from '../lib/storage';

export type Derived = {
  /** The reading track in force, resolved from the stored choice. */
  plan: PhasedTrack;
  phases: PhaseProgress[];
  statuses: Map<number, PhaseStatus>;
  overall: OverallProgress;
  streak: Streak;
  pace: Pace;
  currentPhase: number;
};

/**
 * `tone` is 'done' when the change that earned this undo finished a book. The
 * bar is the only surface already on screen at that moment, so it carries the
 * celebration rather than a second toast fighting it for the same corner.
 */
export type UndoState = { label: string; tone?: 'done' } | null;

export type Store = {
  data: AppData;
  derived: Derived;
  /** How this session's data was loaded, surfaced in the backup panel. */
  load: LoadResult;
  undoable: UndoState;
  /**
   * The day marking is logged against, or null for whenever today is. Session
   * only: reading yesterday's chapters is a moment, not a setting.
   */
  logDay: DayKey | null;
  setLogDay: (day: DayKey | null) => void;
  /** Optional time of day for the next mark. Null means the reader did not say. */
  logSlot: Slot | null;
  setLogSlot: (slot: Slot | null) => void;
  toggleChapter: (book: string, chapter: number) => void;
  /** Marks the next `count` unread chapters in plan order. */
  markNext: (count: number) => void;
  /** Marks an explicit set of chapters, re-dating any that were already read. */
  markChapters: (book: string, chapters: number[]) => void;
  clearChapters: (book: string, chapters: number[]) => void;
  clearBook: (book: string, chapters: number) => void;
  addHighlight: (highlight: Highlight) => void;
  /** Empty text clears the thought but keeps the highlight. */
  noteHighlight: (id: string, note: string) => void;
  removeHighlight: (id: string) => void;
  saveNote: (book: string, chapter: number | null, text: string) => void;
  deleteNote: (id: string) => void;
  noteFor: (book: string, chapter: number | null) => Note | undefined;
  importData: (data: AppData) => void;
  /** Applies an already-merged journal pulled from the cloud. Not undoable. */
  mergeRemote: (data: AppData) => void;
  choosePlan: (id: string) => void;
  setPrefs: (prefs: Prefs) => void;
  undo: () => void;
};

export const StoreContext = createContext<Store | null>(null);

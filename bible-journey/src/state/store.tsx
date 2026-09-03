import { useCallback, useEffect, useMemo, useReducer, useState, type ReactNode } from 'react';
import { clampReadingDay, today, type DayKey } from '../lib/dates';
import { overallProgress, pace, phaseProgressAll, phaseStatuses, streak } from '../lib/progress';
import { play, primeSound, setSoundEnabled } from '../lib/sound';
import {
  loadData,
  requestPersistence,
  saveData,
  type LoadResult,
  type Slot,
} from '../lib/storage';
import { StoreContext, type Derived, type Store, type UndoState } from './context';
import { activeTrack, reducer } from './reducer';

export function StoreProvider({ children }: { children: ReactNode }) {
  const load = useMemo<LoadResult>(loadData, []);
  const [state, dispatch] = useReducer(reducer, { data: load.data, previous: null, cue: null });
  const { data, previous, cue } = state;
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

  /*
   * Sound follows the synced preference, and the audio context is opened on the
   * first gesture anywhere rather than on the first cue. Every cue is downstream
   * of a tap, but React flushes effects after the handler has returned, which is
   * late enough for Safari to refuse the resume and leave the app silent.
   */
  const soundOn = data.prefs?.soundEnabled !== false;
  useEffect(() => {
    setSoundEnabled(soundOn);
    if (soundOn) primeSound();
  }, [soundOn]);

  /*
   * Keyed on the cue object, which only changes when the reducer stamps a new
   * one. An action that earns no sound leaves the old cue in place, so this does
   * not fire again for it.
   */
  useEffect(() => {
    if (cue) play(cue.name);
  }, [cue]);

  const derived = useMemo<Derived>(() => {
    const plan = activeTrack(data.planId);
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
    () => (previous ? { label: previous.label, tone: previous.tone } : null),
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

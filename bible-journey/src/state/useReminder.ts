import { useEffect, useState } from 'react';
import { today } from '../lib/dates';
import { loadPrefs, reminderDue, savePrefs, type Prefs } from '../lib/prefs';
import { nextUnread, readsByDay } from '../lib/progress';
import { useStore } from './useStore';

const CHECK_INTERVAL_MS = 60_000;

export type ReminderState = {
  prefs: Prefs;
  setPrefs: (next: Prefs) => void;
  permission: NotificationPermission | 'unsupported';
  requestPermission: () => Promise<void>;
  /** True when the streak is alive but nothing has been read today. */
  streakAtRisk: boolean;
  notifyNow: () => void;
};

export function useReminder(): ReminderState {
  const { data, derived } = useStore();
  const [prefs, setPrefsState] = useState<Prefs>(loadPrefs);
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
  );
  const [tick, setTick] = useState(0);

  const readToday = (readsByDay(data.read).get(today()) ?? 0) > 0;
  const streakAtRisk = derived.streak.current > 0 && !readToday;

  const setPrefs = (next: Prefs) => {
    setPrefsState(next);
    savePrefs(next);
  };

  function notify(body: string) {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    new Notification('Bibley', { body, icon: '/icon-192.png', badge: '/icon-192.png', tag: 'bibley-daily' });
  }

  const notifyNow = () => {
    const next = nextUnread(data.read, 1, derived.plan)[0];
    notify(next ? `Today's reading: ${next.book} ${next.chapter}` : 'Time to read.');
  };

  // A minute tick, so the reminder can fire while the app is open in a tab.
  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), CHECK_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (readToday || !reminderDue(prefs)) return;
    const next = nextUnread(data.read, 1, derived.plan)[0];
    const streakLine =
      derived.streak.current > 0
        ? `Your ${derived.streak.current} day streak needs a chapter. `
        : '';
    notify(
      next ? `${streakLine}Next up: ${next.book} ${next.chapter}.` : `${streakLine}Time to read.`,
    );
    setPrefs({ ...prefs, lastNotifiedDay: today() });
    // `tick` drives the re-check; the rest are inputs to the message.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, readToday, prefs.remindersEnabled, prefs.reminderTime, prefs.lastNotifiedDay]);

  const requestPermission = async () => {
    if (typeof Notification === 'undefined') return;
    const result = await Notification.requestPermission();
    setPermission(result);
  };

  return { prefs, setPrefs, permission, requestPermission, streakAtRisk, notifyNow };
}

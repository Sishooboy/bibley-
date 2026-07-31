import { today, type DayKey } from './dates';

const PREFS_KEY = 'bible-journey/prefs';

/**
 * Device-level settings, deliberately not synced. A reminder time that makes
 * sense on your phone is not one you want firing on a laptop at work.
 */
export type Prefs = {
  remindersEnabled: boolean;
  /** 24h `HH:MM`. */
  reminderTime: string;
  /** Guards against nagging twice in one day. */
  lastNotifiedDay?: DayKey;
};

export const DEFAULT_PREFS: Prefs = {
  remindersEnabled: false,
  reminderTime: '20:00',
};

export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    return {
      remindersEnabled: parsed.remindersEnabled === true,
      reminderTime: /^\d{2}:\d{2}$/.test(parsed.reminderTime ?? '')
        ? (parsed.reminderTime as string)
        : DEFAULT_PREFS.reminderTime,
      lastNotifiedDay: typeof parsed.lastNotifiedDay === 'string' ? parsed.lastNotifiedDay : undefined,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function savePrefs(prefs: Prefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch (err) {
    console.error('Could not save settings.', err);
  }
}

/** True once the clock has passed the reminder time today. */
export function reminderDue(prefs: Prefs, now = new Date()): boolean {
  if (!prefs.remindersEnabled) return false;
  if (prefs.lastNotifiedDay === today()) return false;
  const [h, m] = prefs.reminderTime.split(':').map(Number);
  return now.getHours() > h || (now.getHours() === h && now.getMinutes() >= m);
}

export function formatTime(value: string): string {
  const [h, m] = value.split(':').map(Number);
  const date = new Date();
  date.setHours(h, m, 0, 0);
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

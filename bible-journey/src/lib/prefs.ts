import { today, type DayKey } from './dates';

/** Only a device event log lives here now: the settings themselves are synced. */
const NOTIFIED_KEY = 'bible-journey/notified';

export type Prefs = {
  remindersEnabled: boolean;
  /** 24h `HH:MM`. */
  reminderTime: string;
  /** Set on every change so two devices can be compared. */
  updatedAt?: string;
};

export const DEFAULT_PREFS: Prefs = {
  remindersEnabled: false,
  reminderTime: '20:00',
};

/**
 * Reminders are locked until the Capacitor shell can schedule them. A web
 * notification only fires while the tab is alive, which is the wrong promise to
 * make on a reminder, so the feature is held back rather than half delivered.
 *
 * Flip this to true to bring it back. Saved prefs are deliberately left alone,
 * so every reader's own time and toggle return exactly as they left them.
 */
export const REMINDERS_UNLOCKED: boolean = false;

export function normalizePrefs(input: unknown): Prefs | undefined {
  if (typeof input !== 'object' || input === null) return undefined;
  const raw = input as Partial<Prefs>;
  return {
    remindersEnabled: raw.remindersEnabled === true,
    reminderTime: /^\d{2}:\d{2}$/.test(raw.reminderTime ?? '')
      ? (raw.reminderTime as string)
      : DEFAULT_PREFS.reminderTime,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : undefined,
  };
}

/**
 * Which day this device last fired a notification. Deliberately not synced: it
 * records what a device did, not what the reader wants, and syncing it would let
 * one device's nudge silence another's.
 */
export function loadNotifiedDay(): DayKey | null {
  try {
    return localStorage.getItem(NOTIFIED_KEY);
  } catch {
    return null;
  }
}

export function saveNotifiedDay(day: DayKey): void {
  try {
    localStorage.setItem(NOTIFIED_KEY, day);
  } catch (err) {
    console.error('Could not record the reminder.', err);
  }
}

/** True once the clock has passed the reminder time today. */
export function reminderDue(prefs: Prefs, notifiedDay: DayKey | null, now = new Date()): boolean {
  // Checked here rather than in the view, so an account that already had
  // reminders switched on stops being nudged too.
  if (!REMINDERS_UNLOCKED) return false;
  if (!prefs.remindersEnabled) return false;
  if (notifiedDay === today()) return false;
  const [h, m] = prefs.reminderTime.split(':').map(Number);
  return now.getHours() > h || (now.getHours() === h && now.getMinutes() >= m);
}

export function formatTime(value: string): string {
  const [h, m] = value.split(':').map(Number);
  const date = new Date();
  date.setHours(h, m, 0, 0);
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/** All dates in this app are local-time day keys: 'YYYY-MM-DD'. */
export type DayKey = string;

export function toDayKey(d: Date): DayKey {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function today(): DayKey {
  return toDayKey(new Date());
}

export function fromDayKey(key: DayKey): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key: DayKey, n: number): DayKey {
  const d = fromDayKey(key);
  d.setDate(d.getDate() + n);
  return toDayKey(d);
}

export function daysBetween(a: DayKey, b: DayKey): number {
  const ms = fromDayKey(b).getTime() - fromDayKey(a).getTime();
  return Math.round(ms / 86_400_000);
}

export function formatDay(key: DayKey, opts: Intl.DateTimeFormatOptions = {}): string {
  return fromDayKey(key).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    ...opts,
  });
}

export function isDayKey(value: unknown): value is DayKey {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  // A real Date rejects nothing, so 2026-02-31 has to be caught by round trip.
  return toDayKey(fromDayKey(value)) === value;
}

/**
 * A reading day the app will accept: a real date, and never in the future.
 * Anything else falls back to today, which is the only safe guess.
 *
 * A future day is not merely odd. `streak` measures the gap from the last
 * reading day to today, so a day ahead of today would keep a streak alive
 * without anyone reading anything.
 */
export function clampReadingDay(value: unknown, now: DayKey = today()): DayKey {
  if (!isDayKey(value)) return now;
  return value > now ? now : value;
}

export function relativeDay(key: DayKey): string {
  const diff = daysBetween(key, today());
  if (diff === 0) return 'today';
  if (diff === 1) return 'yesterday';
  if (diff < 7) return `${diff} days ago`;
  return formatDay(key, { year: undefined });
}

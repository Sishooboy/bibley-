import { QUOTES, type Quote } from '../data/quotes';
import { today, type DayKey } from './dates';

/** FNV-1a: small, stable, and dependency free. */
function hash(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * The day's verse is a pure function of the date, so it stays put across reloads
 * and needs nothing stored.
 */
export function quoteForDay(day: DayKey = today()): Quote {
  return QUOTES[hash(day) % QUOTES.length];
}

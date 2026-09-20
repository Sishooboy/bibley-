/*
 * Whether a streak has landed on a number scripture keeps.
 *
 * Pure and tiny, so the rule can be pinned without rendering a celebration or
 * playing a sound, the same shape as `presentation()` in `insights.ts`.
 */
import { BIBLE_NUMBERS, type BibleNumber, type NumberRef } from '../data/numbers';
import { verseRef } from './highlight';

const BY_NUMBER = new Map<number, BibleNumber>(BIBLE_NUMBERS.map((entry) => [entry.n, entry]));

/**
 * The entry for this streak, or null for the ordinary days.
 *
 * **Most days are ordinary and that is the point.** A milestone every week
 * would be a tick rather than a moment, so the list is short and the gaps
 * between entries get longer as a run grows.
 */
export function milestoneFor(streak: number): BibleNumber | null {
  if (!Number.isInteger(streak) || streak < 1) return null;
  return BY_NUMBER.get(streak) ?? null;
}

/**
 * "Genesis 7:12".
 *
 * Through `verseRef` rather than a template string of its own, because that is
 * the one spelling of a Bible reference in this app and a second one would
 * drift the first time either changed.
 */
export function refLabel([book, chapter, verse]: NumberRef): string {
  return verseRef(book, chapter, verse, verse);
}

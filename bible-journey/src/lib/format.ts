import type { ChapterRef } from '../data/plan';

/** "Genesis 1–3", or "Genesis 50 · Exodus 1–2" when a run crosses books. */
export function formatRefs(refs: ChapterRef[]): string {
  if (refs.length === 0) return '';
  const groups: { book: string; chapters: number[] }[] = [];
  for (const ref of refs) {
    const last = groups[groups.length - 1];
    if (last && last.book === ref.book) last.chapters.push(ref.chapter);
    else groups.push({ book: ref.book, chapters: [ref.chapter] });
  }
  return groups
    .map(({ book, chapters }) => {
      const first = chapters[0];
      const last = chapters[chapters.length - 1];
      return chapters.length === 1 ? `${book} ${first}` : `${book} ${first}–${last}`;
    })
    .join(' · ');
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function formatNumber(n: number): string {
  return n.toLocaleString();
}

/**
 * The digits of a streak, most significant first, for the celebration's slot
 * reels: one entry per reel, so "12" is two reels reading left to right rather
 * than one reel and a stray digit.
 */
export function digitsOf(n: number): number[] {
  return String(Math.max(0, Math.floor(n)))
    .split('')
    .map(Number);
}

/**
 * Minutes to read a passage of `words` words, never less than one. 200 words a
 * minute is a slow reader taking scripture in rather than a fast one skimming
 * it, which is the honest pace to promise on a button. Rounded because "about
 * 3 min" is a promise and "2.7 min" is a measurement, and only one of those
 * belongs on something you are being invited to press.
 */
export function readingMinutes(words: number): number {
  return Math.max(1, Math.round(words / 200));
}

/** Words in a chapter, for `readingMinutes`. Null verses are not read aloud or silently. */
export function countWords(verses: readonly (string | null)[]): number {
  let n = 0;
  for (const v of verses) if (v) n += v.trim().split(/\s+/).length;
  return n;
}

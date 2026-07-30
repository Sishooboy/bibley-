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

import { CANON } from '../data/canon';
import { PLANS, type Plan } from '../data/plans';

export type Where = { book: string; chapter: number };

/** Chapter counts for every book, from the plan that contains them all. */
const CHAPTERS = new Map(PLANS.both.phases.flatMap((p) => p.books).map((b) => [b.name, b.chapters]));

export function chapterCount(book: string): number {
  return CHAPTERS.get(book) ?? 0;
}

/**
 * Reads a chapter number out of whatever is currently in a text field.
 *
 * Half-typed input has to survive: an empty field is what a field looks like
 * mid-edit, and clamping it to 1 there is why the number could not be deleted.
 * So anything unreadable falls back rather than overwriting what the reader is
 * in the middle of typing, and clamping to the book's length waits for blur.
 */
export function readChapter(text: string, max: number, fallback: number): number {
  const n = Number.parseInt(text, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(max, n));
}

/**
 * What comes before and after a chapter.
 *
 * Inside a book both orders agree, so this only really decides what happens at a
 * book's last chapter. If the chapter is part of the reader's plan, the plan
 * decides, which is what makes reading straight through walk the plan. If it is
 * not, the plan has no opinion and printed order takes over, so wandering off to
 * a book the plan does not contain still behaves like a Bible.
 */
export function neighbours(
  book: string,
  chapter: number,
  plan: Plan,
): { previous?: Where; next?: Where } {
  const at = plan.sequence.findIndex((r) => r.book === book && r.chapter === chapter);
  if (at !== -1) {
    const pick = (i: number): Where | undefined => {
      const ref = i >= 0 && i < plan.sequence.length ? plan.sequence[i] : undefined;
      return ref && { book: ref.book, chapter: ref.chapter };
    };
    return { previous: pick(at - 1), next: pick(at + 1) };
  }
  return { previous: canonicalStep(book, chapter, -1), next: canonicalStep(book, chapter, 1) };
}

function canonicalStep(book: string, chapter: number, step: 1 | -1): Where | undefined {
  const total = chapterCount(book);
  if (total === 0) return undefined;

  const within = chapter + step;
  if (within >= 1 && within <= total) return { book, chapter: within };

  const i = CANON.indexOf(book);
  if (i === -1) return undefined;
  const nextBook = CANON[i + step];
  if (!nextBook) return undefined;

  return { book: nextBook, chapter: step === 1 ? 1 : chapterCount(nextBook) };
}

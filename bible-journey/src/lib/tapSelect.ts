/** A tap that has already happened, kept only long enough to spot a second one. */
export type LastTap = { chapter: number; at: number } | null;

/** Long enough to be comfortable on a phone, short enough not to catch two separate taps. */
export const DOUBLE_TAP_MS = 450;

export function isDoubleTap(
  last: LastTap,
  chapter: number,
  now: number,
  windowMs = DOUBLE_TAP_MS,
): boolean {
  return last !== null && last.chapter === chapter && now - last.at <= windowMs;
}

/** Every chapter from one end to the other, whichever way round they were tapped. */
export function rangeBetween(a: number, b: number): number[] {
  const [lo, hi] = a <= b ? [a, b] : [b, a];
  return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
}

export type TapAction =
  /** An ordinary tap: add or remove this one chapter. */
  | { kind: 'toggle'; chapter: number }
  /** First double tap: remember it as one end of a range. */
  | { kind: 'anchor'; chapter: number }
  /** Second double tap: take everything between the two. */
  | { kind: 'range'; chapters: number[] };

/**
 * What a tap means, given what came just before it.
 *
 * Dragging was the obvious way to select a run of chapters and the wrong one on
 * a phone: a vertical drag is how you scroll, and no amount of holding still
 * first made that comfortable. Double tapping each end of the run asks nothing
 * of the gesture system, works the same with a thumb or a mouse, and needs no
 * decision about whether a movement was meant for the page or for the grid.
 */
export function interpretTap(
  chapter: number,
  last: LastTap,
  anchor: number | null,
  now: number,
): TapAction {
  if (!isDoubleTap(last, chapter, now)) return { kind: 'toggle', chapter };
  if (anchor === null) return { kind: 'anchor', chapter };
  return { kind: 'range', chapters: rangeBetween(anchor, chapter) };
}

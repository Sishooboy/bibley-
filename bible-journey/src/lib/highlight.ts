import type { Highlight, Spot } from './storage';

/** A run of verse text, carrying the highlight it belongs to if any. */
export type Segment = { text: string; id?: string; note?: boolean };

export type Range = { from: Spot; to: Spot };

/** Order two points in a chapter, so a backwards selection still makes sense. */
export function order(a: Spot, b: Spot): Range {
  const after = a.verse > b.verse || (a.verse === b.verse && a.offset > b.offset);
  return after ? { from: b, to: a } : { from: a, to: b };
}

export function isEmptyRange(range: Range): boolean {
  return range.from.verse === range.to.verse && range.from.offset >= range.to.offset;
}

/** Where a highlight starts and ends inside one particular verse, if at all. */
function spanIn(highlight: Highlight, verse: number, length: number): [number, number] | null {
  if (verse < highlight.from.verse || verse > highlight.to.verse) return null;
  const start = verse === highlight.from.verse ? highlight.from.offset : 0;
  const end = verse === highlight.to.verse ? highlight.to.offset : length;
  const from = Math.max(0, Math.min(length, start));
  const to = Math.max(0, Math.min(length, end));
  return to > from ? [from, to] : null;
}

/**
 * Splits a verse into runs of plain and highlighted text.
 *
 * Overlaps are resolved by whichever highlight was made most recently, decided
 * per character rather than per highlight, so two overlapping marks leave three
 * visible runs instead of one swallowing the other.
 */
export function segmentVerse(
  text: string,
  verse: number,
  highlights: Highlight[],
): Segment[] {
  const spans = highlights
    .map((h) => ({ h, span: spanIn(h, verse, text.length) }))
    .filter((entry): entry is { h: Highlight; span: [number, number] } => entry.span !== null);

  if (spans.length === 0) return [{ text }];

  // Boundaries turn overlapping ranges into a flat run of non-overlapping cells.
  const edges = new Set<number>([0, text.length]);
  for (const { span } of spans) {
    edges.add(span[0]);
    edges.add(span[1]);
  }
  const points = [...edges].sort((x, y) => x - y);

  const out: Segment[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [start, end] = [points[i], points[i + 1]];
    if (start === end) continue;

    const covering = spans
      .filter(({ span }) => span[0] <= start && span[1] >= end)
      .sort((x, y) => x.h.createdAt.localeCompare(y.h.createdAt));
    const winner = covering[covering.length - 1];

    const segment: Segment = { text: text.slice(start, end) };
    if (winner) {
      segment.id = winner.h.id;
      segment.note = !!winner.h.note?.trim();
    }

    // Fold neighbouring runs that belong to the same highlight, so a mark is one
    // element and gets one set of rounded ends.
    const last = out[out.length - 1];
    if (last && last.id === segment.id && last.note === segment.note) last.text += segment.text;
    else out.push(segment);
  }

  return out;
}

/**
 * Character offset of a point inside a verse's rendered text.
 *
 * The verse is drawn as several elements once it contains a highlight, so the
 * offset cannot be read off a single text node. This walks the verse in document
 * order and adds up everything before the point, which is stable no matter how
 * the verse happens to be split.
 */
export function offsetWithin(root: Element, node: Node, nodeOffset: number): number {
  if (!root.contains(node)) return 0;

  let total = 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let current = walker.nextNode();
  while (current) {
    if (current === node) return total + nodeOffset;
    total += current.textContent?.length ?? 0;
    current = walker.nextNode();
  }

  // The point sits on an element rather than inside a text node, which happens
  // when a selection ends exactly on a boundary.
  return node === root ? Math.min(total, nodeOffset) : total;
}

/** The verse element a node sits in, or null if the node is outside the text. */
export function verseRootOf(node: Node | null): HTMLElement | null {
  const el = node instanceof Element ? node : (node?.parentElement ?? null);
  return el?.closest<HTMLElement>('[data-verse]') ?? null;
}

/** Highlights belonging to one chapter, oldest first. */
export function highlightsFor(
  all: Highlight[] | undefined,
  book: string,
  chapter: number,
): Highlight[] {
  return (all ?? [])
    .filter((h) => h.book === book && h.chapter === chapter)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function highlightRef(highlight: Highlight): string {
  const { from, to } = highlight;
  const verses = from.verse === to.verse ? `${from.verse}` : `${from.verse}-${to.verse}`;
  return `${highlight.book} ${highlight.chapter}:${verses}`;
}

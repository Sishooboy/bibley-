/**
 * Where something the app says came from.
 *
 * Every book introduction, chapter note, heading note, verse context and
 * reading-order claim carries at least one, and `sources.test.ts` fails if one
 * is missing. There are two kinds because there are two kinds of claim.
 *
 * A verse, when the Bible itself is the evidence. That is most of them, and it
 * is the strong kind: the test checks that the verse exists in the text the app
 * ships, and that any words a note puts in quotation marks really are in it.
 *
 * A named work with a link, when the Bible is not: a date, a manuscript, a name
 * in another language, something somebody said about the book centuries later.
 * Each one was read before it was cited, and a claim no readable source would
 * support was rewritten or cut rather than left standing on nothing.
 */
export type Source = VerseSource | WorkSource;

/** "Genesis 1", "Genesis 1:3" or "Genesis 1:3-5". One chapter at most. */
export type VerseSource = { ref: string };

/** A work outside the Bible. `by` is the author or publisher, when there is one. */
export type WorkSource = { title: string; by?: string; url: string };

export function isVerse(source: Source): source is VerseSource {
  return 'ref' in source;
}

export type ParsedRef = { book: string; chapter: number; from?: number; to?: number };

/**
 * Splits a reference into its book and its numbers. Book names can carry
 * digits and spaces ("1 John", "Song of Songs"), so the numbers are read from
 * the end and whatever is left is the book.
 */
export function parseRef(ref: string): ParsedRef | null {
  const m = /^(.+?) (\d+)(?::(\d+)(?:-(\d+))?)?$/.exec(ref.trim());
  if (!m) return null;
  const chapter = Number(m[2]);
  const from = m[3] === undefined ? undefined : Number(m[3]);
  const to = m[4] === undefined ? from : Number(m[4]);
  if (from !== undefined && to !== undefined && to < from) return null;
  return { book: m[1], chapter, from, to };
}

/** What a source is called on the screen. */
export function sourceLabel(source: Source): string {
  if (isVerse(source)) return source.ref;
  return source.by ? `${source.by}, ${source.title}` : source.title;
}

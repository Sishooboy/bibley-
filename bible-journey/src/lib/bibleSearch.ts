import type { BookText } from './bible';

export type VerseHit = {
  book: string;
  chapter: number;
  verse: number;
  /** The verse as printed, so the result reads the way the page does. */
  text: string;
  /** Where the match sits in `text`, for the marker in the result row. */
  at: number;
  length: number;
};

/**
 * Lowercased, with the typographic marks folded onto the ones a keyboard has.
 *
 * **Every replacement here has to be one character for one character.** The
 * index this search returns is used to slice the *original* verse, so a fold
 * that changed the length would highlight the wrong words. `’` to `'` and `“`
 * to `"` are one for one, and so is lowercasing every letter in this text.
 */
export function fold(text: string): string {
  return text.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
}

/**
 * The query as it will be matched. Collapsing runs of whitespace matters because
 * a phrase typed with two spaces should still find a verse printed with one.
 */
export function foldQuery(query: string): string {
  return fold(query).replace(/\s+/g, ' ').trim();
}

/**
 * Every verse in one book containing the phrase, in reading order.
 *
 * Substring, not word, on purpose: "shepherd" should find "shepherds", and
 * somebody halfway through typing a word still wants to see something. `limit`
 * stops a common word walking the whole book once the caller has enough.
 */
export function findInBook(text: BookText, query: string, limit = Infinity): VerseHit[] {
  const needle = foldQuery(query);
  if (!needle) return [];

  const hits: VerseHit[] = [];
  for (let c = 0; c < text.chapters.length; c++) {
    const verses = text.chapters[c];
    for (let v = 0; v < verses.length; v++) {
      const verse = verses[v];
      // A null verse is a number this translation carries nothing behind.
      if (!verse) continue;
      const at = fold(verse).indexOf(needle);
      if (at === -1) continue;
      hits.push({
        book: text.book,
        chapter: c + 1,
        verse: v + 1,
        text: verse,
        at,
        length: needle.length,
      });
      if (hits.length >= limit) return hits;
    }
  }
  return hits;
}

/**
 * A window of the verse around the match, so a long verse does not push the
 * words you searched for off the end of the row. Returns the three pieces the
 * row draws: what comes before, the match itself, and what comes after.
 */
export function excerpt(
  hit: VerseHit,
  before = 42,
  after = 90,
): { head: string; match: string; tail: string } {
  const start = Math.max(0, hit.at - before);
  const end = Math.min(hit.text.length, hit.at + hit.length + after);
  return {
    head: (start > 0 ? '…' : '') + hit.text.slice(start, hit.at),
    match: hit.text.slice(hit.at, hit.at + hit.length),
    tail: hit.text.slice(hit.at + hit.length, end) + (end < hit.text.length ? '…' : ''),
  };
}

/**
 * Turning a chapter's verses into the blocks a page is actually set in.
 *
 * The reader used to put every verse on its own line, because the source the
 * text came from publishes verses and nothing else. That is not how a Bible is
 * printed and it is not how prose is read: it turns Mark into a numbered list
 * and makes a paragraph of narrative look like a list of unrelated facts.
 *
 * `layout` is one character a verse, built by `scripts/build-layout.mjs` from
 * the World English Bible's own USFM, which is public domain like the text:
 *
 *   p        prose, continues the paragraph it is in
 *   P        prose, opens a new paragraph
 *   1 2 3    a line of poetry, at that indent
 *   4 5 6    the same, after a stanza break
 */
export type Block =
  | { kind: 'prose'; verses: number[] }
  | { kind: 'poetry'; indent: 1 | 2 | 3; stanza: boolean; verses: number[] };

const POETRY = '123456';

/**
 * A chapter as blocks, verse numbers only, 1-based.
 *
 * **A verse belongs to exactly one block and is never split**, which is what
 * lets the reader keep rendering one `data-verse` span per verse. Highlights
 * are character offsets inside a verse string, so a verse broken across two
 * elements would need offsets that knew where the break was, and every
 * highlight already recorded would be pointing at the wrong half.
 *
 * With no layout every verse becomes its own paragraph, which is what the
 * reader did before any of this existed. Thirteen chapters are in that state on
 * purpose: Esther and Daniel carry Greek chapters the USFM publishes as
 * separate books, and Sirach and Romans differ from it by a verse in a few
 * places, so those keep the old setting rather than a layout one verse out of
 * step with the words.
 */
export function blocksFor(verses: readonly (string | null)[], layout?: string): Block[] {
  const blocks: Block[] = [];
  let prose: { kind: 'prose'; verses: number[] } | null = null;

  for (let i = 0; i < verses.length; i++) {
    // A null verse is a number this translation's source has nothing behind.
    // It takes no room on the page, and a printed Bible passes over it too.
    if (verses[i] === null) continue;

    const number = i + 1;
    const code = layout?.[i];

    if (code && POETRY.includes(code)) {
      prose = null;
      const depth = Number(code);
      blocks.push({
        kind: 'poetry',
        indent: (depth > 3 ? depth - 3 : depth) as 1 | 2 | 3,
        stanza: depth > 3,
        verses: [number],
      });
      continue;
    }

    // No layout at all, or a verse marked as opening one: start a paragraph.
    if (!code || code === 'P' || !prose) {
      prose = { kind: 'prose', verses: [] };
      blocks.push(prose);
    }
    prose.verses.push(number);
  }

  return blocks;
}

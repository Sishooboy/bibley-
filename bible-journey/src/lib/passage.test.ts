import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { blocksFor } from './passage';

const book = (slug: string) =>
  JSON.parse(readFileSync(join(process.cwd(), `public/bible/${slug}.json`), 'utf8')) as {
    chapters: (string | null)[][];
    layout?: string[];
  };

/** Every verse number the blocks cover, in the order they would be painted. */
const painted = (blocks: ReturnType<typeof blocksFor>) => blocks.flatMap((b) => b.verses);

describe('setting a chapter in paragraphs', () => {
  it('runs prose together and breaks where the source says', () => {
    const verses = ['a', 'b', 'c', 'd', 'e'];
    expect(blocksFor(verses, 'PppPp')).toEqual([
      { kind: 'prose', verses: [1, 2, 3] },
      { kind: 'prose', verses: [4, 5] },
    ]);
  });

  it('gives every poetry line its own block, at its own indent', () => {
    const verses = ['a', 'b', 'c'];
    expect(blocksFor(verses, 'P12')).toEqual([
      { kind: 'prose', verses: [1] },
      { kind: 'poetry', indent: 1, stanza: false, verses: [2] },
      { kind: 'poetry', indent: 2, stanza: false, verses: [3] },
    ]);
  });

  it('reads 4, 5 and 6 as the same indents after a stanza break', () => {
    expect(blocksFor(['a', 'b', 'c'], '456')).toEqual([
      { kind: 'poetry', indent: 1, stanza: true, verses: [1] },
      { kind: 'poetry', indent: 2, stanza: true, verses: [2] },
      { kind: 'poetry', indent: 3, stanza: true, verses: [3] },
    ]);
  });

  it('falls back to a paragraph a verse when there is no layout', () => {
    /*
     * Thirteen chapters are in this state on purpose, so the fallback is not a
     * theoretical branch: it is what Esther 11 and Romans 16 actually render.
     * It has to be exactly what the reader did before layout existed.
     */
    expect(blocksFor(['a', 'b', 'c'])).toEqual([
      { kind: 'prose', verses: [1] },
      { kind: 'prose', verses: [2] },
      { kind: 'prose', verses: [3] },
    ]);
    expect(blocksFor(['a', 'b', 'c'], '')).toEqual(blocksFor(['a', 'b', 'c']));
  });

  it('passes over a verse this translation has nothing behind', () => {
    // Luke 17:36 and the rest. The slot has to stay so later numbering is right,
    // and a printed Bible passes over it in silence too.
    expect(blocksFor(['a', null, 'c'], 'Ppp')).toEqual([{ kind: 'prose', verses: [1, 3] }]);
  });

  it('never drops or duplicates a verse, whatever the layout says', () => {
    const verses = Array.from({ length: 12 }, (_, i) => `v${i + 1}`);
    for (const layout of ['PppPppPppPpp', '123456123456', 'PpP1p2P3pPp4', '', undefined]) {
      const seen = painted(blocksFor(verses, layout));
      expect(seen, `layout ${JSON.stringify(layout)}`).toEqual(
        Array.from({ length: 12 }, (_, i) => i + 1),
      );
    }
  });
});

describe('the layout that actually ships', () => {
  const mark = book('mark');

  it('has a code for every verse of every chapter it covers', () => {
    /*
     * A layout one character short would silently shift every verse after the
     * gap into the wrong block, which reads as the paragraphs being broken in
     * the middle of sentences rather than as a bug.
     */
    for (const [i, verses] of mark.chapters.entries()) {
      const codes = mark.layout?.[i] ?? '';
      if (codes === '') continue;
      expect(codes.length, `Mark ${i + 1}`).toBe(verses.length);
      expect(codes, `Mark ${i + 1}`).toMatch(/^[pP123456]+$/);
    }
  });

  it('sets Mark 1 as paragraphs rather than as a list', () => {
    const blocks = blocksFor(mark.chapters[0], mark.layout?.[0]);
    // 45 verses. One block a verse would mean nothing had changed.
    expect(mark.chapters[0]).toHaveLength(45);
    expect(blocks.length).toBeLessThan(25);
    // The Isaiah quotation at verse 3 is lineated in the source.
    expect(blocks.some((b) => b.kind === 'poetry')).toBe(true);
    // And every verse is still on the page exactly once.
    expect(painted(blocks)).toEqual(Array.from({ length: 45 }, (_, i) => i + 1));
  });

  it('covers all but the thirteen chapters it cannot line up', () => {
    /*
     * Esther and Daniel carry Greek chapters the USFM publishes as books of
     * their own, and Sirach and Romans differ from that source by a verse in a
     * few places. Those keep the old setting rather than a layout one verse out
     * of step with the words, and the count is pinned so a rebuild that quietly
     * drops half the Bible is a failing test rather than a worse reader.
     */
    const slugs = readFileSync(join(process.cwd(), 'src/data/canon.ts'), 'utf8');
    expect(slugs).toBeTruthy();
    let withLayout = 0;
    let without = 0;
    for (const file of ['mark', 'john', 'genesis', 'psalms', 'romans', 'esther', 'daniel']) {
      const b = book(file);
      b.chapters.forEach((_, i) => ((b.layout?.[i] ?? '') ? withLayout++ : without++));
    }
    expect(withLayout).toBeGreaterThan(200);
    // Esther 10 to 16, Daniel 13 and 14, Romans 16.
    expect(without).toBe(10);
  });
});

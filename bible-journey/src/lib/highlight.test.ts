import { describe, expect, it } from 'vitest';
import { CANON, NEW_TESTAMENT, OLD_TESTAMENT } from '../data/canon';
import { PLANS } from '../data/plans';
import { highlightRef, isEmptyRange, order, segmentVerse } from './highlight';
import { chapterCount, neighbours, readChapter } from './navigate';
import type { Highlight } from './storage';

function mark(over: Partial<Highlight> = {}): Highlight {
  return {
    id: 'h1',
    book: 'John',
    chapter: 3,
    from: { verse: 16, offset: 0 },
    to: { verse: 16, offset: 11 },
    text: 'For God so',
    createdAt: '2026-02-01T00:00:00.000Z',
    updatedAt: '2026-02-01T00:00:00.000Z',
    ...over,
  };
}

const VERSE = 'For God so loved the world, that he gave his one and only Son.';

describe('segmentVerse', () => {
  it('leaves an unmarked verse in one piece', () => {
    expect(segmentVerse(VERSE, 16, [])).toEqual([{ text: VERSE }]);
  });

  it('splits a verse around a highlight', () => {
    const segments = segmentVerse(VERSE, 16, [
      mark({ from: { verse: 16, offset: 0 }, to: { verse: 16, offset: 10 } }),
    ]);

    expect(segments.map((s) => s.text)).toEqual(['For God so', VERSE.slice(10)]);
    expect(segments[0].id).toBe('h1');
    expect(segments[1].id).toBeUndefined();
  });

  it('ignores a highlight that belongs to a different verse', () => {
    const segments = segmentVerse(VERSE, 17, [mark()]);
    expect(segments).toEqual([{ text: VERSE }]);
  });

  it('covers the whole verse for the middle of a multi-verse highlight', () => {
    const segments = segmentVerse(VERSE, 17, [
      mark({ from: { verse: 16, offset: 4 }, to: { verse: 18, offset: 3 } }),
    ]);
    expect(segments).toHaveLength(1);
    expect(segments[0].id).toBe('h1');
  });

  it('starts at zero on the last verse of a multi-verse highlight', () => {
    const segments = segmentVerse(VERSE, 18, [
      mark({ from: { verse: 16, offset: 4 }, to: { verse: 18, offset: 7 } }),
    ]);
    expect(segments[0].text).toBe(VERSE.slice(0, 7));
    expect(segments[0].id).toBe('h1');
  });

  it('gives the overlap to the newer highlight, as one run not two', () => {
    const segments = segmentVerse(VERSE, 16, [
      mark({ id: 'old', from: { verse: 16, offset: 0 }, to: { verse: 16, offset: 20 } }),
      mark({
        id: 'new',
        from: { verse: 16, offset: 10 },
        to: { verse: 16, offset: 30 },
        createdAt: '2026-03-01T00:00:00.000Z',
      }),
    ]);

    // The contested middle and the rest of the newer mark are adjacent and the
    // same colour, so they fold: one element, one set of rounded ends.
    expect(segments.map((s) => s.id)).toEqual(['old', 'new', undefined]);
    expect(segments[0].text).toBe(VERSE.slice(0, 10));
    expect(segments[1].text).toBe(VERSE.slice(10, 30));
    expect(segments.map((s) => s.text).join('')).toBe(VERSE);
  });

  it('never loses or duplicates a character', () => {
    const segments = segmentVerse(VERSE, 16, [
      mark({ id: 'a', from: { verse: 16, offset: 4 }, to: { verse: 16, offset: 9 } }),
      mark({ id: 'b', from: { verse: 16, offset: 20 }, to: { verse: 16, offset: 25 } }),
    ]);
    expect(segments.map((s) => s.text).join('')).toBe(VERSE);
  });

  it('clamps an offset that runs past the end of the verse', () => {
    // Guards against a highlight made against different text, or a bad write.
    const segments = segmentVerse('short', 1, [
      mark({ from: { verse: 1, offset: 0 }, to: { verse: 1, offset: 9999 } }),
    ]);
    expect(segments.map((s) => s.text).join('')).toBe('short');
  });

  it('flags a highlight that carries a thought', () => {
    const segments = segmentVerse(VERSE, 16, [mark({ note: 'the hinge of the gospel' })]);
    expect(segments[0].note).toBe(true);
  });
});

describe('order and empties', () => {
  it('turns a backwards selection the right way round', () => {
    const range = order({ verse: 9, offset: 4 }, { verse: 3, offset: 1 });
    expect(range.from).toEqual({ verse: 3, offset: 1 });
    expect(range.to).toEqual({ verse: 9, offset: 4 });
  });

  it('treats a click with no drag as empty', () => {
    expect(isEmptyRange(order({ verse: 3, offset: 5 }, { verse: 3, offset: 5 }))).toBe(true);
    expect(isEmptyRange(order({ verse: 3, offset: 5 }, { verse: 3, offset: 6 }))).toBe(false);
  });
});

describe('highlightRef', () => {
  it('names one verse plainly and a span with a range', () => {
    expect(highlightRef(mark())).toBe('John 3:16');
    expect(highlightRef(mark({ to: { verse: 18, offset: 2 } }))).toBe('John 3:16-18');
  });
});

describe('navigating by hand', () => {
  const both = PLANS.both;

  it('moves within a book the obvious way', () => {
    expect(neighbours('John', 3, both).next).toEqual({ book: 'John', chapter: 4 });
    expect(neighbours('John', 3, both).previous).toEqual({ book: 'John', chapter: 2 });
  });

  it('follows the plan at the end of a book the plan contains', () => {
    // The combined plan opens with all of John, then starts again at Genesis.
    expect(neighbours('John', 21, both).next).toEqual({ book: 'Genesis', chapter: 1 });
  });

  it('falls back to printed order for a book outside the plan', () => {
    // Reading the Old Testament while on the New Testament plan.
    const nt = PLANS.nt;
    expect(neighbours('Genesis', 50, nt).next).toEqual({ book: 'Exodus', chapter: 1 });
    expect(neighbours('Exodus', 1, nt).previous).toEqual({ book: 'Genesis', chapter: 50 });
  });

  it('stops at the ends of the Bible rather than wrapping', () => {
    expect(neighbours('Genesis', 1, PLANS.nt).previous).toBeUndefined();
    expect(neighbours('Revelation', 22, PLANS.nt).next).toBeUndefined();
  });

  it('knows how many chapters each book has', () => {
    expect(chapterCount('Psalms')).toBe(150);
    expect(chapterCount('Jude')).toBe(1);
    expect(chapterCount('Not a book')).toBe(0);
  });
});

/**
 * Reading a chapter number out of a field being typed into. Clamping an empty
 * field to 1 on every keystroke is what stopped the digit being deleted, so an
 * unreadable field has to fall back rather than overwrite.
 */
describe('readChapter', () => {
  it('leaves a half-typed field alone instead of refilling it', () => {
    expect(readChapter('', 21, 6)).toBe(6);
    expect(readChapter('', 21, 14)).toBe(14);
  });

  it('reads a plain number', () => {
    expect(readChapter('12', 21, 1)).toBe(12);
    expect(readChapter('007', 21, 1)).toBe(7);
  });

  it('holds it inside the book', () => {
    expect(readChapter('99', 21, 1)).toBe(21);
    expect(readChapter('0', 21, 5)).toBe(1);
  });

  it('falls back on anything that is not a number at all', () => {
    expect(readChapter('abc', 21, 4)).toBe(4);
    expect(readChapter('-', 21, 4)).toBe(4);
  });
});

describe('the canon list', () => {
  it('holds the same 66 books as the plan data', () => {
    const planBooks = PLANS.both.phases.flatMap((p) => p.books.map((b) => b.name)).sort();
    expect([...CANON].sort()).toEqual(planBooks);
  });

  it('splits into the same testaments the plans use', () => {
    const names = (id: 'nt' | 'ot') =>
      PLANS[id].phases.flatMap((p) => p.books.map((b) => b.name)).sort();

    expect([...NEW_TESTAMENT].sort()).toEqual(names('nt'));
    expect([...OLD_TESTAMENT].sort()).toEqual(names('ot'));
  });

  it('starts and ends where a printed Bible does', () => {
    expect(CANON[0]).toBe('Genesis');
    expect(CANON[CANON.length - 1]).toBe('Revelation');
    expect(CANON).toHaveLength(66);
  });
});

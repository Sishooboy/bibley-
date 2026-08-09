import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { bookSlug, type BookText } from './bible';
import { excerpt, findInBook, fold, foldQuery } from './bibleSearch';

const DIR = join(process.cwd(), 'public', 'bible');

async function read(book: string): Promise<BookText> {
  return JSON.parse(await readFile(join(DIR, `${bookSlug(book)}.json`), 'utf8')) as BookText;
}

function book(chapters: (string | null)[][]): BookText {
  return { book: 'Test', translation: 'WEB', chapters };
}

describe('fold', () => {
  /*
   * The whole search rests on this. The index a hit reports is used to slice the
   * original verse, so a fold that changed the length would highlight the wrong
   * words, or throw at the end of a line.
   */
  it('never changes the length of what it folds', () => {
    const samples = [
      'For God so loved the world',
      'He said, “I AM WHO I AM.”',
      'Yahweh’s word came to me',
      'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
      '‘quoted’ and “quoted”',
    ];
    for (const sample of samples) expect(fold(sample).length).toBe(sample.length);
  });

  it('folds the typographic marks onto the ones a keyboard has', () => {
    expect(fold('don’t')).toBe("don't");
    expect(fold('“peace”')).toBe('"peace"');
  });

  it('collapses whitespace in the query but not in the verse', () => {
    expect(foldQuery('  the   LORD is  ')).toBe('the lord is');
    expect(fold('the  Lord')).toBe('the  lord');
  });
});

describe('findInBook', () => {
  const sample = book([
    ['In the beginning', 'God created the heavens', null],
    ['The earth was formless', 'and God said'],
  ]);

  it('finds a phrase wherever it is, in reading order', () => {
    const hits = findInBook(sample, 'god');
    expect(hits.map((h) => [h.chapter, h.verse])).toEqual([
      [1, 2],
      [2, 2],
    ]);
  });

  it('reports where the match sits, so the row can mark it', () => {
    const [hit] = findInBook(sample, 'created');
    expect(hit.text.slice(hit.at, hit.at + hit.length)).toBe('created');
  });

  it('walks straight past a verse this translation does not carry', () => {
    // Chapter 1 verse 3 is null. Matching against it would throw.
    expect(() => findInBook(sample, 'e')).not.toThrow();
    expect(findInBook(sample, 'e').some((h) => h.verse === 3)).toBe(false);
  });

  it('matches inside a word, since half a typed word is still a search', () => {
    expect(findInBook(sample, 'begin')).toHaveLength(1);
  });

  it('stops at the limit it was given', () => {
    expect(findInBook(sample, 'e', 2)).toHaveLength(2);
  });

  it('has nothing to say about an empty query', () => {
    expect(findInBook(sample, '')).toEqual([]);
    expect(findInBook(sample, '   ')).toEqual([]);
  });
});

describe('excerpt', () => {
  const long = book([
    [
      'Now the serpent was more subtle than any animal of the field which Yahweh God had made. He said to the woman, “Has God really said, ‘You shall not eat of any tree of the garden’?”',
    ],
  ]);

  it('cuts the tail off a match near the start, and says so', () => {
    const [hit] = findInBook(long, 'serpent');
    const parts = excerpt(hit);

    expect(parts.match).toBe('serpent');
    // Nothing was dropped in front of it, so nothing claims to have been.
    expect(parts.head).toBe('Now the ');
    expect(parts.tail.endsWith('…')).toBe(true);
  });

  it('cuts the head off a match near the end, and says so', () => {
    const [hit] = findInBook(long, 'woman');
    const parts = excerpt(hit);

    expect(parts.match).toBe('woman');
    expect(parts.head.startsWith('…')).toBe(true);
    expect(parts.tail.endsWith('…')).toBe(false);
  });

  it('does not cut what already fits', () => {
    const [hit] = findInBook(book([['God is love']]), 'God');
    const parts = excerpt(hit);

    expect(parts.head).toBe('');
    expect(parts.match).toBe('God');
    expect(parts.tail).toBe(' is love');
  });
});

/**
 * Against the real text, because the point of the fold is the real text: the
 * bundled Bible is full of typographic apostrophes and a reader will type the
 * straight one on their keyboard.
 */
describe('against the bundled text', () => {
  it('finds a famous verse by its plain words', () => {
    return read('John').then((john) => {
      const hits = findInBook(john, 'For God so loved the world');
      expect(hits).toHaveLength(1);
      expect([hits[0].chapter, hits[0].verse]).toEqual([3, 16]);
    });
  });

  it('finds a verse whose apostrophe is typographic, typed with a straight one', () => {
    return read('Psalms').then((psalms) => {
      const curly = findInBook(psalms, 'Yahweh’s');
      const straight = findInBook(psalms, "Yahweh's");
      expect(straight.length).toBeGreaterThan(0);
      expect(straight.length).toBe(curly.length);
    });
  });

  it('slices the original verse correctly at every hit it reports', () => {
    return read('Genesis').then((genesis) => {
      const hits = findInBook(genesis, 'god');
      expect(hits.length).toBeGreaterThan(100);
      for (const hit of hits) {
        expect(fold(hit.text.slice(hit.at, hit.at + hit.length))).toBe('god');
      }
    });
  });
});

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CANON } from '../data/canon';
import { bookSlug } from './bible';
import { TRANSLATIONS, highlightTranslation, isKnownTranslation, translationShort } from './translations';

type Book = { book: string; chapters: (string | null)[][]; layout: string[] };

const read = (dir: string, book: string) =>
  JSON.parse(readFileSync(join(process.cwd(), 'public', dir, `${bookSlug(book)}.json`), 'utf8')) as Book;

/*
 * The only chapters where the King James numbers its verses differently from the
 * World English Bible. Romans moves its closing doxology from the end of 14 to
 * the end of 16, and Sirach 20 and 23 differ by a verse. Pinned rather than
 * merely allowed, because a rebuild that shifted any other chapter by a verse
 * would move every King James highlight recorded in it, and nothing else would
 * notice.
 */
const DIFFERENT_VERSE_COUNTS = new Set(['Romans 14', 'Romans 16', 'Sirach 20', 'Sirach 23']);

describe('the King James text', () => {
  it('has every book the app prints, with the same chapters as the World English Bible', () => {
    for (const book of CANON) {
      const kjv = read('bible/kjv', book);
      const web = read('bible', book);
      expect(kjv.chapters.length, book).toBe(web.chapters.length);
    }
  });

  it('numbers its verses as the World English Bible does, outside four known chapters', () => {
    const differ: string[] = [];
    for (const book of CANON) {
      const kjv = read('bible/kjv', book);
      const web = read('bible', book);
      kjv.chapters.forEach((verses, i) => {
        if (verses.length !== web.chapters[i].length) differ.push(`${book} ${i + 1}`);
      });
    }
    expect(new Set(differ)).toEqual(DIFFERENT_VERSE_COUNTS);
  });

  // The archive tags every word with a Strong's number and wraps the supplied
  // words, the divine name and Christ's words in markers. One left behind is a
  // backslash or a pipe in the middle of a verse.
  it('carries no USFM markup', () => {
    for (const book of CANON) {
      for (const verses of read('bible/kjv', book).chapters) {
        for (const v of verses) {
          if (v === null) continue;
          expect(v, book).not.toMatch(/[\\|]|strong=/);
          expect(v.trim(), book).toBe(v);
          expect(v.length, book).toBeGreaterThan(0);
        }
      }
    }
  });

  it('gives every verse a layout code the reader knows', () => {
    for (const book of CANON) {
      const { chapters, layout } = read('bible/kjv', book);
      chapters.forEach((verses, i) => {
        expect(layout[i].length, `${book} ${i + 1}`).toBe(verses.length);
        expect(layout[i], `${book} ${i + 1}`).toMatch(/^[pP1-6]*$/);
      });
    }
  });

  it('opens a titled psalm with its title, the way the World English Bible does', () => {
    expect(read('bible/kjv', 'Psalms').chapters[2][0]).toMatch(/^A Psalm of David, when he fled from Absalom his son\. LORD/);
  });
});

describe('which translation a highlight belongs to', () => {
  it('is the World English Bible when nothing says otherwise, as every older one is', () => {
    expect(highlightTranslation({})).toBe('web');
    expect(highlightTranslation({ translation: 'kjv' })).toBe('kjv');
  });

  // Folded into the default, a translation a later version adds would have its
  // highlights drawn over the WEB's words at the wrong character positions.
  it('keeps a translation this build does not know rather than calling it the WEB', () => {
    expect(highlightTranslation({ translation: 'bsb' })).toBe('bsb');
    expect(isKnownTranslation('bsb')).toBe(false);
    expect(translationShort('bsb')).toBe('BSB');
  });
});

describe('the translations', () => {
  // Every book but the ones a translation says it lacks, and none of those: a
  // file the reader was told is not there would never be opened, and a missing
  // file it was not told about is a book that waits forever.
  it('have a file for every book of the canon they have', () => {
    for (const t of TRANSLATIONS) {
      for (const book of CANON) {
        const has = !t.lacksBooks?.includes(book);
        expect(existsSync(join(process.cwd(), 'public', t.dir, `${bookSlug(book)}.json`)), `${t.id} ${book}`).toBe(has);
      }
    }
  });

  it('credit each text under every chapter, the King James with its UK caveat', () => {
    for (const t of TRANSLATIONS) expect(t.credit, t.id).toContain(t.name);
    expect(TRANSLATIONS.find((t) => t.id === 'kjv')?.credit).toMatch(/outside the UK/);
  });
});

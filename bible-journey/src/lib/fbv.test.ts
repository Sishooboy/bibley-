import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CANON } from '../data/canon';
import { CREDITS } from '../data/credits';
import { bookSlug } from './bible';
import { booksIn, hasBook, hasChapter, textTranslation, translationById } from './translations';

type Book = { book: string; chapters: (string | null)[][]; layout: string[] };

const fileOf = (dir: string, book: string) => join(process.cwd(), 'public', dir, `${bookSlug(book)}.json`);
const read = (dir: string, book: string) => JSON.parse(readFileSync(fileOf(dir, book), 'utf8')) as Book;

const fbv = translationById('fbv');
const HAS = booksIn('fbv', CANON);

/*
 * The only chapters where the Free Bible Version numbers its verses differently
 * from the World English Bible. Esther 10 stops at the Hebrew verse 3, where the
 * WEB runs on into the Greek additions; Romans keeps its doxology at the end of
 * 16 rather than 14, as the King James does; and 3 John splits its last verse
 * in two. Pinned rather than merely allowed, because a rebuild that shifted any
 * other chapter by a verse would move every highlight recorded in it, and
 * nothing else would notice.
 */
const DIFFERENT_VERSE_COUNTS = new Set(['Esther 10', 'Romans 14', 'Romans 16', '3 John 1']);

/*
 * Verse numbers the FBV keeps empty, so every verse after them keeps its
 * number. Its source is the critical text, which leaves out the verses the King
 * James tradition carries and later manuscripts added, where the WEB omits only
 * four. Pinned for the same reason as the counts: one gained or lost here
 * renumbers the rest of its chapter.
 */
const NULL_VERSES = new Set([
  'Matthew 17:21', 'Matthew 18:11', 'Matthew 23:14',
  'Mark 7:16', 'Mark 9:44', 'Mark 9:46', 'Mark 11:26', 'Mark 15:28',
  'Luke 17:36', 'Luke 23:17', 'John 5:4',
  'Acts 8:37', 'Acts 15:34', 'Acts 24:7', 'Acts 28:29', 'Romans 16:24',
]);

describe('the Free Bible Version text', () => {
  it('is a protestant Bible: the 66 books, and no file for the seven it does not have', () => {
    expect(HAS).toHaveLength(66);
    expect(fbv.lacksBooks).toEqual(['Tobit', 'Judith', 'Wisdom', 'Sirach', 'Baruch', '1 Maccabees', '2 Maccabees']);
    for (const book of CANON) expect(existsSync(fileOf('bible/fbv', book)), book).toBe(hasBook('fbv', book));
  });

  it('has every chapter the app counts, with the Greek ones empty and every other one full', () => {
    const empty: string[] = [];
    for (const book of HAS) {
      const own = read('bible/fbv', book);
      expect(own.chapters.length, book).toBe(read('bible', book).chapters.length);
      own.chapters.forEach((verses, i) => {
        if (verses.length === 0) empty.push(`${book} ${i + 1}`);
        else expect(verses.some((v) => v !== null), `${book} ${i + 1}`).toBe(true);
        expect(verses.length === 0, `${book} ${i + 1}`).toBe(!hasChapter('fbv', book, i + 1));
      });
    }
    expect(empty).toEqual(['Esther 11', 'Esther 12', 'Esther 13', 'Esther 14', 'Esther 15', 'Esther 16', 'Daniel 13', 'Daniel 14']);
  });

  it('numbers its verses as the World English Bible does, outside four known chapters', () => {
    const differ: string[] = [];
    for (const book of HAS) {
      const own = read('bible/fbv', book);
      const web = read('bible', book);
      own.chapters.forEach((verses, i) => {
        if (verses.length > 0 && verses.length !== web.chapters[i].length) differ.push(`${book} ${i + 1}`);
      });
    }
    expect(new Set(differ)).toEqual(DIFFERENT_VERSE_COUNTS);
  });

  it('keeps an empty slot for exactly the verses it leaves out', () => {
    const nulls: string[] = [];
    for (const book of HAS) {
      read('bible/fbv', book).chapters.forEach((verses, i) =>
        verses.forEach((v, j) => {
          if (v === null) nulls.push(`${book} ${i + 1}:${j + 1}`);
        }),
      );
    }
    expect(new Set(nulls)).toEqual(NULL_VERSES);
  });

  // The archive tags most words with a Strong's number and carries footnotes
  // inline. One left behind is a backslash, a pipe or a note in mid verse.
  it('carries no USFM markup and no footnotes', () => {
    for (const book of HAS) {
      for (const verses of read('bible/fbv', book).chapters) {
        for (const v of verses) {
          if (v === null) continue;
          expect(v, book).not.toMatch(/[\\|*]|strong=/);
          expect(v.trim(), book).toBe(v);
          expect(v.length, book).toBeGreaterThan(0);
        }
      }
    }
    // John 1:1's footnote explains "the Word"; it must not be in the verse.
    expect(read('bible/fbv', 'John').chapters[0][0]).toBe(
      'In the beginning the Word already was. The Word was with God, and the Word was God.',
    );
  });

  it('gives every verse a layout code the reader knows', () => {
    for (const book of HAS) {
      const { chapters, layout } = read('bible/fbv', book);
      chapters.forEach((verses, i) => {
        expect(layout[i].length, `${book} ${i + 1}`).toBe(verses.length);
        expect(layout[i], `${book} ${i + 1}`).toMatch(/^[pP1-6]*$/);
      });
    }
  });

  it('opens a titled psalm with its title, the way the World English Bible does', () => {
    expect(read('bible/fbv', 'Psalms').chapters[22][0]).toBe(
      'A psalm of David. Since the Lord is my shepherd, I have everything I need.',
    );
  });
});

describe('a book or chapter a translation does not have', () => {
  it('is known without a fetch, the book and the chapter apart', () => {
    expect(hasBook('fbv', 'Tobit')).toBe(false);
    expect(hasChapter('fbv', 'Tobit', 1)).toBe(false);
    expect(hasBook('fbv', 'Esther')).toBe(true);
    expect(hasChapter('fbv', 'Esther', 10)).toBe(true);
    expect(hasChapter('fbv', 'Esther', 11)).toBe(false);
    expect(hasChapter('fbv', 'Daniel', 12)).toBe(true);
    expect(hasChapter('fbv', 'Daniel', 13)).toBe(false);
    for (const book of CANON) {
      expect(hasBook('web', book), book).toBe(true);
      expect(hasBook('kjv', book), book).toBe(true);
    }
  });

  // A prefetch or a reading time wants words, and the WEB is what the reader
  // offers in their place, so that is what they are counted in.
  it('is fetched in the World English Bible when any text will do', () => {
    expect(textTranslation('fbv', 'Tobit')).toBe('web');
    expect(textTranslation('fbv', 'Genesis')).toBe('fbv');
    expect(textTranslation('kjv', 'Tobit')).toBe('kjv');
  });
});

describe('the credit the licence asks for', () => {
  /*
   * Creative Commons Attribution Share-Alike is the only reason these words
   * can ship at all, and its first condition is "the above copyright and source
   * information". So the line eBible.org prints, the source, and the licence
   * linked, under every chapter and on the credits card. Losing any of them is
   * not a style regression; it is shipping somebody's work outside its terms.
   */
  it('is under every chapter in the reader, with the licence linked', () => {
    expect(fbv.credit).toContain('Free Bible Version');
    expect(fbv.credit).toContain('Copyright © 2018 Dr. Jonathan Gallagher');
    expect(fbv.credit).toContain('eBible.org');
    expect(fbv.licence).toEqual({ name: 'CC BY-SA 4.0', url: 'https://creativecommons.org/licenses/by-sa/4.0/' });
    const reader = readFileSync(join(process.cwd(), 'src/components/Reader.tsx'), 'utf8');
    expect(reader).toContain('href={reading.licence.url}');
  });

  it('is on the Sources and credits card, with the licence linked and what was changed', () => {
    const credit = CREDITS.find((c) => c.work === 'Free Bible Version');
    expect(credit?.terms).toContain('Copyright © 2018 Dr. Jonathan Gallagher');
    expect(credit?.terms).toMatch(/Share-Alike/);
    // The licence asks that changes be indicated: the footnotes are left out.
    expect(credit?.terms).toMatch(/footnotes/i);
    expect(credit?.licence?.url).toBe('https://creativecommons.org/licenses/by-sa/4.0/');
    const settings = readFileSync(join(process.cwd(), 'src/views/SettingsView.tsx'), 'utf8');
    expect(settings).toContain('href={credit.licence.url}');
  });
});

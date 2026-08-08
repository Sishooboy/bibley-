import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PLANS } from '../data/plans';
import { QUOTES } from '../data/quotes';
import { bookSlug, type BookText } from './bible';

const DIR = join(process.cwd(), 'public', 'bible');

const books = PLANS.both.phases.flatMap((p) => p.books);

async function read(book: string): Promise<BookText> {
  return JSON.parse(await readFile(join(DIR, `${bookSlug(book)}.json`), 'utf8')) as BookText;
}

/**
 * The reader and the tracker have to agree. If the plan says John has 21
 * chapters and the text file has 20, a reader who marks John 21 gets a chapter
 * that cannot be opened, and no way to tell which half is wrong. That is worth
 * a test that reads all 73 files.
 */
describe('the bundled text matches the plan', () => {
  it('has a file for every book', async () => {
    const found = await Promise.all(
      books.map(async (b) => {
        const text = await read(b.name);
        return { name: b.name, chapters: text.chapters.length, book: text.book };
      }),
    );

    expect(found).toHaveLength(73);
    for (const entry of found) expect(entry.book).toBe(entry.name);
  });

  it('has exactly the chapter count the plan claims, for every book', async () => {
    const mismatches: string[] = [];
    for (const b of books) {
      const text = await read(b.name);
      if (text.chapters.length !== b.chapters) {
        mismatches.push(`${b.name}: plan ${b.chapters}, text ${text.chapters.length}`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  it('has no empty chapter and no blank verse', async () => {
    const empties: string[] = [];
    for (const b of books) {
      const text = await read(b.name);
      text.chapters.forEach((verses, i) => {
        if (!verses || verses.length === 0) empties.push(`${b.name} ${i + 1}`);
        else if (verses.some((v) => v !== null && v.trim() === '')) {
          empties.push(`${b.name} ${i + 1} has a blank verse`);
        }
      });
    }
    expect(empties).toEqual([]);
  });

  /**
   * These numbers exist in the tradition the numbering comes from but not in
   * the source text behind this translation. The four in Luke and Acts are the
   * King James ones. The rest are Sirach, where the longer Greek text carries
   * verses the shorter one this is translated from does not. Pinned
   * deliberately: if the list ever changes, the text was replaced, and that is
   * worth noticing rather than absorbing.
   */
  it('omits exactly the verses this translation does not carry', async () => {
    const gaps: string[] = [];
    for (const b of books) {
      const text = await read(b.name);
      text.chapters.forEach((verses, i) => {
        verses.forEach((v, j) => {
          if (v === null) gaps.push(`${b.name} ${i + 1}:${j + 1}`);
        });
      });
    }
    expect(gaps.sort()).toEqual([
      'Acts 15:34',
      'Acts 24:7',
      'Acts 8:37',
      'Luke 17:36',
      'Sirach 10:21',
      'Sirach 11:15',
      'Sirach 11:16',
      'Sirach 13:14',
      'Sirach 16:15',
      'Sirach 16:16',
      'Sirach 17:16',
      'Sirach 17:18',
      'Sirach 17:21',
      'Sirach 17:5',
      'Sirach 17:9',
      'Sirach 18:3',
      'Sirach 19:18',
      'Sirach 19:19',
      'Sirach 19:21',
      'Sirach 1:21',
      'Sirach 1:5',
      'Sirach 1:7',
      'Sirach 20:3',
      'Sirach 22:10',
      'Sirach 22:9',
      'Sirach 24:18',
      'Sirach 24:24',
      'Sirach 25:12',
      'Sirach 26:19',
      'Sirach 26:20',
      'Sirach 26:21',
      'Sirach 26:22',
      'Sirach 26:23',
      'Sirach 26:24',
      'Sirach 26:25',
      'Sirach 26:26',
      'Sirach 26:27',
      'Sirach 3:19',
      'Sirach 3:25',
    ]);
  });

  /**
   * The deuterocanonical books are joined onto the books they belong to rather
   * than left standing on their own, because that is how a Catholic Bible
   * prints them and how they are cited. Every join is an append, which is what
   * makes it safe: Esther 1 to 10:3 and Daniel 1 to 12 are untouched, so a
   * highlight recorded before this landed still points at the same words.
   */
  it('joins the additions on without moving anything that was already there', async () => {
    const esther = await read('Esther');
    expect(esther.chapters).toHaveLength(16);
    expect(esther.chapters[9][0]).toMatch(/^King Ahasuerus laid a tribute/);
    expect(esther.chapters[9]).toHaveLength(13);

    const daniel = await read('Daniel');
    expect(daniel.chapters).toHaveLength(14);
    expect(daniel.chapters[11]).toHaveLength(13);
    expect(daniel.chapters[12][0]).toMatch(/^THERE lived a man in Babylon/);

    const baruch = await read('Baruch');
    expect(baruch.chapters).toHaveLength(6);
    expect(baruch.chapters[5][0]).toMatch(/^A copy of an epistle, which Jeremy sent/);
  });

  it('keeps all 35,415 verse numbers, so numbering never shifts', async () => {
    let total = 0;
    for (const b of books) {
      const text = await read(b.name);
      total += text.chapters.reduce((n, verses) => n + verses.length, 0);
    }
    expect(total).toBe(35415);
  });

  /**
   * The verse of the day names a reference under the quote, and a reader who
   * wants the surrounding chapter has to be able to find it. A quote pointing at
   * a book or a chapter that does not exist would look like a typo in scripture
   * rather than a typo in this file.
   */
  it('can reach the chapter behind every verse of the day', async () => {
    const unreachable: string[] = [];
    for (const quote of QUOTES) {
      // "1 Maccabees 3:19" and "Psalm 121:1-2": the book is everything before
      // the last space, the chapter everything before the colon after it.
      const at = quote.ref.lastIndexOf(' ');
      const name = quote.ref.slice(0, at);
      const chapter = Number.parseInt(quote.ref.slice(at + 1), 10);
      // A single psalm is cited as "Psalm 91", not "Psalms 91", which is how
      // anyone would say it out loud and the only book this applies to.
      const book = books.find((b) => b.name === name || b.name === `${name}s`);
      if (!book) {
        unreachable.push(`${quote.ref}: no such book`);
        continue;
      }
      const text = await read(book.name);
      if (!text.chapters[chapter - 1]) unreachable.push(`${quote.ref}: no such chapter`);
    }
    expect(unreachable).toEqual([]);
  });

  it('has the text right where it is easiest to check', async () => {
    const john = await read('John');
    expect(john.chapters[2][15]).toMatch(/^For God so loved the world/);

    const genesis = await read('Genesis');
    expect(genesis.chapters[0][0]).toMatch(/In the beginning/);

    const psalms = await read('Psalms');
    expect(psalms.chapters[22][0]).toMatch(/Yahweh is my shepherd/);
  });

  /**
   * Markup, and the arrowhead the deuterocanonical books use to mark a plural
   * "you". Both are notes to a translator rather than anything to read, and the
   * arrowhead in particular appears in only seven of the books, so leaving it in
   * would make those seven look broken beside the rest.
   */
  it('leaves no markup and no editorial marker in the text', async () => {
    const dirty: string[] = [];
    for (const b of books) {
      const text = await read(b.name);
      text.chapters.forEach((verses, i) => {
        if (verses.some((v) => v !== null && /<[^>]+>|⌃/.test(v))) {
          dirty.push(`${b.name} ${i + 1}`);
        }
      });
    }
    expect(dirty).toEqual([]);
  });
});

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PLANS } from '../data/plans';
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
 * a test that reads all 66 files.
 */
describe('the bundled text matches the plan', () => {
  it('has a file for every book', async () => {
    const found = await Promise.all(
      books.map(async (b) => {
        const text = await read(b.name);
        return { name: b.name, chapters: text.chapters.length, book: text.book };
      }),
    );

    expect(found).toHaveLength(66);
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
   * These four numbers exist in the King James tradition, which is where the
   * numbering comes from, but not in the source text behind this translation.
   * Pinned deliberately: if the list ever changes, the text was replaced, and
   * that is worth noticing rather than absorbing.
   */
  it('omits exactly the four verses this translation does not carry', async () => {
    const gaps: string[] = [];
    for (const b of books) {
      const text = await read(b.name);
      text.chapters.forEach((verses, i) => {
        verses.forEach((v, j) => {
          if (v === null) gaps.push(`${b.name} ${i + 1}:${j + 1}`);
        });
      });
    }
    expect(gaps.sort()).toEqual(['Acts 15:34', 'Acts 24:7', 'Acts 8:37', 'Luke 17:36']);
  });

  it('keeps all 31,102 verse numbers, so numbering never shifts', async () => {
    let total = 0;
    for (const b of books) {
      const text = await read(b.name);
      total += text.chapters.reduce((n, verses) => n + verses.length, 0);
    }
    expect(total).toBe(31102);
  });

  it('has the text right where it is easiest to check', async () => {
    const john = await read('John');
    expect(john.chapters[2][15]).toMatch(/^For God so loved the world/);

    const genesis = await read('Genesis');
    expect(genesis.chapters[0][0]).toMatch(/In the beginning/);

    const psalms = await read('Psalms');
    expect(psalms.chapters[22][0]).toMatch(/Yahweh is my shepherd/);
  });

  it('leaves no markup in the text', async () => {
    const dirty: string[] = [];
    for (const b of books) {
      const text = await read(b.name);
      text.chapters.forEach((verses, i) => {
        if (verses.some((v) => v !== null && /<[^>]+>/.test(v))) dirty.push(`${b.name} ${i + 1}`);
      });
    }
    expect(dirty).toEqual([]);
  });
});
